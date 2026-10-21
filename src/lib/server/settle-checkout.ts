import 'server-only';
import type Stripe from 'stripe';
import type { Transaction } from 'firebase-admin/firestore';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { prepareAdminCapacitySettlement } from '@/lib/server/discount-capacity';
import { trackServerEvent } from '@/lib/analytics-server';
import { createHash, randomUUID } from 'node:crypto';
import type { Brand, Location, OrderDetail } from '@/types';
import { buildOrderInvoice, invoiceCounterId } from '@/lib/order-invoice';
import { paidOrderMarketingEnabled } from '@/lib/marketing/config';
import { scratchCardDraftSchema } from '@/lib/games/scratch-card';
import { orderflySession } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import type { RestaurantPaymentForm } from '@/lib/merchant-payment-methods';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { KitchenOrder } from '@/lib/printing/domain';
import { verifyStripePrintPayment, prepareStripePrintTransition, stripePrintTransitionProjection,
  type StripePrintPaymentProof, type StripePrintTransition } from '@/lib/printing/stripe-transition-proof';
import { preparePrintIntentTargetPolicy } from '@/lib/printing/intent-target-policy';
import { projectNativePrintCatalog } from '@/lib/printing/catalog-line-projection';
import { prepareSavedPrinterRouting } from '@/lib/printing/saved-routing';
import { previewPrinterRouting } from '@/lib/printing/routing-preview';
import { prepareStripeSettlementPrintIntents } from '@/lib/printing/outbox';

/** Minted only by the private ACTUAL financial plan, never by an origin/DTO caller. */
export type StripeSettlementPrintCapability = Readonly<{ readonly stripeSettlementPrintCapability: unique symbol }>;
const stripeSettlementPlans = new WeakMap<object, { context: NativeTransactionContext;
  transition: StripePrintTransition; order: Readonly<KitchenOrder>; writeCount: number; financialApplied: boolean }>();
/** Fixed read/assert boundary for the outbox. No mint or mutation callback is exported.
 * Applied means financial mutations queued in THIS transaction, not committed yet.
 */
export function readStripeSettlementPrintCapability(context: NativeTransactionContext, capability: StripeSettlementPrintCapability, requireApplied = false) {
  const entry = capability && typeof capability === 'object' ? stripeSettlementPlans.get(capability) : undefined;
  if (!entry || entry.context !== context || context.db !== getAdminDb() || (requireApplied && !entry.financialApplied)) throw new Error('Unverified settlement print capability');
  const proof = stripePrintTransitionProjection(context, entry.transition); // Irreversible lifetime check.
  if (proof.order.id !== entry.order.id || proof.order.brandId !== entry.order.brandId || proof.order.locationId !== entry.order.locationId) throw new Error('Settlement print scope mismatch');
  return Object.freeze({ order: entry.order, writeCount: entry.writeCount + (proof.replay ? 0 : 1),
    replay: proof.replay, financialApplied: entry.financialApplied });
}


// Only call with a signed webhook or a session retrieved server-to-server from Stripe.
export async function settlePaidCheckoutSession(session: Stripe.Checkout.Session) {
  if (!session.metadata?.orderId || !session.metadata.brandId || !session.metadata.locationId) throw new Error('Missing payment scope');
  if (session.payment_status !== 'paid') return false;
  return settleOrder({ kind: 'stripe', session });
}

// A staff session and transaction-scoped policy replace PSP verification only
// for native pickup orders. The browser never supplies staff identity or amount.
export async function settlePaidPickupOrder(orderId: string, method: RestaurantPaymentForm) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId) || !['cash', 'card'].includes(method)) throw new Error('Ugyldig betalingsregistrering.');
  const actor = await orderflySession();
  return settleOrder({ kind: 'pickup', orderId, method, actor });
}

const isTerminalPaidReplay = (order: { paymentStatus?: unknown; status?: unknown } | undefined) =>
  order?.paymentStatus === 'Paid' && typeof order.status === 'string'
  && ['Completed', 'Delivered', 'Error', 'Canceled'].includes(order.status);

type PaymentProof = { kind: 'stripe'; session: Stripe.Checkout.Session }
  | { kind: 'pickup'; orderId: string; method: RestaurantPaymentForm; actor: Awaited<ReturnType<typeof orderflySession>> };
async function settleOrder(proof: PaymentProof) {
  const session = proof.kind === 'stripe' ? proof.session : null;
  const metadata: { orderId: string; brandId: string; locationId: string } = session
    ? { orderId: session.metadata!.orderId, brandId: session.metadata!.brandId, locationId: session.metadata!.locationId }
    : { orderId: proof.kind === 'pickup' ? proof.orderId : '', brandId: '', locationId: '' };
  const db = getAdminDb();
  const marketingEnabled = paidOrderMarketingEnabled();
  const serverTimestamp = () => getAdminFieldValue().serverTimestamp();
  const orderRef = db.collection('orders').doc(metadata.orderId);
  const piId = session ? typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id : undefined;
  let analytics: OrderDetail['analytics'];
  const issuedAt = new Date().toISOString();
  // Disabled installations retain the old settlement path without print reads or
  // an extra provider request. Native policy is authoritative whenever enabled.
  const printIntentsEnabled = !!session && process.env.ORDERFLY_PRINT_INTENTS_ENABLED === 'true';
  let stripePrintProof: StripePrintPaymentProof | undefined;
  if (printIntentsEnabled) {
    const needsPrintProof = await db.runTransaction(async transaction => {
      const preflight = await preparePrintIntentTargetPolicy({ db, transaction }, { brandId: metadata.brandId, locationId: metadata.locationId });
      return preflight.enabled && !isTerminalPaidReplay((await transaction.get(orderRef)).data());
    }, { readOnly: true });
    if (needsPrintProof) stripePrintProof = await verifyStripePrintPayment(session!.id);
  }
  // Private plan owns the actual settlement writes. Nothing supplied by a caller
  // can replace the mutation, projected state or apply callback. Rebuilt on retry.
  const prepareSettlement = async (context: NativeTransactionContext, transition?: StripePrintTransition) => {
    const transaction: Transaction = context.transaction;
    const writes: Array<() => void> = [];
    let writeCount = 0;
    const addWrite = (apply: () => void, count = 1) => {
      if (!Number.isSafeInteger(count) || count < 1 || count > 500) throw new Error('Settlement write budget exceeded');
      writes.push(apply); writeCount += count;
    };
    const finish = (fulfilled: boolean) => {
      if (!Number.isSafeInteger(writeCount) || writeCount < 0 || writeCount > 500) throw new Error('Settlement write budget exceeded');
      let capability: StripeSettlementPrintCapability | undefined;
      if (transition) {
        const projection = stripePrintTransitionProjection(context, transition);
        const expectedStatus = order.status === 'Pending' ? 'Received' : order.status;
        if (proof.kind !== 'stripe' || projection.order.id !== orderSnap.id || projection.order.brandId !== order.brandId
          || projection.order.locationId !== order.locationId || projection.order.status !== expectedStatus
          || projection.order.paymentMethod !== order.paymentMethod || projection.order.deliveryType !== order.deliveryType
          || projection.replay !== !fulfilled || (fulfilled ? order.paymentStatus !== 'Pending' : order.paymentStatus !== 'Paid')) throw new Error('Settlement print transition mismatch');
        capability = Object.freeze({}) as StripeSettlementPrintCapability;
        stripeSettlementPlans.set(capability, { context, transition, order: projection.order, writeCount, financialApplied: false });
      }
      let applied = false;
      return Object.freeze({ fulfilled, writeCount, capability, apply: () => {
        if (applied) throw new Error('Settlement plan already applied');
        applied = true;
        for (const write of writes) write();
        if (capability) stripeSettlementPlans.get(capability)!.financialApplied = true;
      } });
    };
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) throw new Error('Order not found');
    const order = orderSnap.data()!;
    analytics = order.analytics;
    if (proof.kind === 'pickup') {
      await authorizeTransaction(transaction, proof.actor.identity, order, 'orderfly.orders:edit', 'location');
      if (order.paymentMethod !== 'PayAtPickup' || order.deliveryType !== 'Pickup' || order.psp) throw new Error('Kun afhentningsordrer med betaling i restaurant kan registreres her.');
      metadata.brandId = order.brandId; metadata.locationId = order.locationId;
      if (order.paymentStatus !== 'Paid' && (order.paymentStatus !== 'Pending' || order.status === 'Pending' || order.discountReservation !== 'held')) throw new Error('Ordren er ikke en godkendt ubetalt afhentningsordre.');
    } else {
      if (order.paymentMethod === 'PayAtPickup' || order.brandId !== metadata.brandId || order.locationId !== metadata.locationId || (order.psp?.checkoutSessionId && order.psp.checkoutSessionId !== session!.id)) throw new Error('Payment scope mismatch');
      if (session!.currency?.toLowerCase() !== 'dkk' || session!.amount_total !== Math.round(Number(order.totalAmount) * 100)) throw new Error('Payment amount mismatch');
    }
    if (order.status === 'Canceled' && order.paymentStatus !== 'Paid') throw new Error('Canceled order cannot be fulfilled');
    const confirmationRef = db.collection('orderNotificationJobs').doc(createHash('sha256').update(JSON.stringify(['order-confirmation', order.brandId, metadata.orderId])).digest('hex'));
    const marketingOrderRef = db.collection('marketingOrderOutbox').doc(createHash('sha256').update(JSON.stringify(['omnisend-paid-order', order.brandId, metadata.orderId])).digest('hex'));
    const customerRef = db.collection('customers').doc(order.customerDetails.id);
    const [confirmation, marketingOrder, customerSnap] = await Promise.all([
      transaction.get(confirmationRef), marketingEnabled ? transaction.get(marketingOrderRef) : null, transaction.get(customerRef),
    ]);
    if (confirmation.exists) {
      const job = confirmation.data()!;
      if (job.orderId !== metadata.orderId || job.brandId !== order.brandId || job.locationId !== order.locationId || job.kind !== 'orderConfirmation') throw new Error('Confirmation scope mismatch');
    }
    if (marketingOrder?.exists) {
      const job = marketingOrder.data()!;
      if (job.orderId !== metadata.orderId || job.brandId !== order.brandId || job.locationId !== order.locationId || job.customerId !== order.customerDetails.id || job.kind !== 'paidOrder') throw new Error('Marketing order scope mismatch');
    }
    const ensureConfirmation = () => {
      if (!confirmation.exists && order.status !== 'Canceled') addWrite(() => transaction.set(confirmationRef, {
        orderId: metadata.orderId, brandId: order.brandId, locationId: order.locationId,
        kind: 'orderConfirmation', state: 'pending', eventId: randomUUID(), nextAttemptAt: Date.now(), attempts: 0, createdAt: Date.now(), updatedAt: Date.now(),
      }));
    };
    const ensureMarketingOrder = (eventTime: string) => {
      if (!marketingEnabled) return;
      const customer = customerSnap.data();
      const customerEmail = typeof customer?.email === 'string' ? customer.email.trim().toLowerCase() : '';
      if (!marketingOrder?.exists && order.status !== 'Canceled' && customerSnap.exists && customer?.brandId === order.brandId && customer?.marketingConsent === true && customerEmail && customerEmail === String(order.customerContact || '').trim().toLowerCase()) addWrite(() => transaction.set(marketingOrderRef, {
        orderId: metadata.orderId, brandId: order.brandId, locationId: order.locationId, customerId: order.customerDetails.id,
        kind: 'paidOrder', state: 'pending', eventId: randomUUID(), eventTime, nextAttemptAt: Date.now(), attempts: 0, createdAt: Date.now(), updatedAt: Date.now(),
      }));
    };
    // A legacy path could mark Paid without the outbox job. Repair only this
    // verified session's missing job, without replaying financial accounting.
    if (order.paymentStatus === 'Paid') {
      if (session && order.psp?.checkoutSessionId !== session.id) throw new Error('Payment scope mismatch');
      ensureConfirmation();
      if (order.invoice) ensureMarketingOrder(order.invoice.issuedAt);
      return finish(false);
    }
    const year = Number(issuedAt.slice(0, 4));
    const counterRef = db.collection('invoiceCounters').doc(invoiceCounterId(order.brandId, year));
    const brandRef = db.collection('brands').doc(order.brandId);
    const locationRef = db.collection('locations').doc(order.locationId);
    const [counterSnap, brandSnap, locationSnap] = await Promise.all([
      transaction.get(counterRef), transaction.get(brandRef), transaction.get(locationRef),
    ]);
    if (!brandSnap.exists || !locationSnap.exists) throw new Error('Invoice seller configuration missing');
    const brand = { ...brandSnap.data(), id: order.brandId } as Brand;
    const location = { ...locationSnap.data(), id: order.locationId } as Location;
    if (location.brandId !== order.brandId) throw new Error('Invoice location scope mismatch');
    const sequence = Number(counterSnap.data()?.lastNumber || 0) + 1;
    const paymentCollection = proof.kind === 'pickup' ? {
      receivedAt: issuedAt, employeeId: proof.actor.actorId, employeeName: proof.actor.name, method: proof.method,
    } : undefined;
    const invoice = buildOrderInvoice({ order: { ...order, id: orderSnap.id, ...(paymentCollection ? { paymentCollection } : {}) } as OrderDetail, brand, location, sequence, issuedAt, paymentReference: piId || undefined });
    if (customerSnap.exists && customerSnap.data()?.brandId !== order.brandId) throw new Error('Customer scope mismatch');
    const discountId = order.appliedDiscountId;
    const discountRef = discountId ? db.collection('discounts').doc(discountId) : null;
    const discountSnap = discountRef ? await transaction.get(discountRef) : null;
    if (discountSnap?.exists && discountSnap.data()?.brandId !== order.brandId) throw new Error('Discount scope mismatch');
    const gameVoucherRef=discountId?.startsWith('game_')?db.collection('gameVouchers').doc(discountId.slice(5)):null;
    const gameVoucher=gameVoucherRef?await transaction.get(gameVoucherRef):null;
    if(gameVoucher?.exists&&(gameVoucher.data()?.brandId!==order.brandId||gameVoucher.data()?.discountId!==discountId))throw new Error('Game voucher scope mismatch');
    const gameDrafts=discountSnap?.exists&&!gameVoucher?.exists?await transaction.get(db.collection('gameScratchDrafts').where('brandId','==',order.brandId)):null;
    const sharedCampaign=gameDrafts?.docs.find(doc=>{const game=scratchCardDraftSchema.safeParse(doc.data());return game.success&&game.data.prizes.some(p=>p.codeMode==='shared'&&p.sharedCode?.toUpperCase()===String(discountSnap?.data()?.code||'').toUpperCase());});
    const sharedGame=sharedCampaign?scratchCardDraftSchema.safeParse(sharedCampaign.data()):null;
    const sharedPrize=sharedGame?.success?sharedGame.data.prizes.find(p=>p.codeMode==='shared'&&p.sharedCode?.toUpperCase()===String(discountSnap?.data()?.code||'').toUpperCase()):null;
    const upsellIds = [...new Set<string>(Array.isArray(order.verifiedUpsellIds) ? order.verifiedUpsellIds.filter((id: unknown): id is string => typeof id === 'string' && /^[^/\\?#]{1,160}$/.test(id)) : [])].slice(0,97);
    const upsellRecords = await Promise.all(upsellIds.map(async id => {
      const ref = db.collection('upsells').doc(id);
      return {ref,snapshot:await transaction.get(ref)};
    }));
    const settleCapacity = await prepareAdminCapacitySettlement(db, transaction, order, true);
    // Capacity is a multi-write internal component. Missing metadata must not
    // fall through addWrite's default for ordinary single writes.
    if (!Number.isSafeInteger(settleCapacity.writeCount) || settleCapacity.writeCount < 1) throw new Error('Settlement write budget exceeded');
    addWrite(settleCapacity, settleCapacity.writeCount);
    // Counters and Paid transition commit atomically. A repeated webhook takes
    // the Paid branch above and cannot count these offers again.
    for (const {ref,snapshot} of upsellRecords) {
      const offer = snapshot.data();
      if (snapshot.exists && offer && offer.brandId === order.brandId && Array.isArray(offer.locationIds) && offer.locationIds.includes(order.locationId)) {
        addWrite(() => transaction.update(ref,{conversions:Math.max(0,Number(offer.conversions)||0)+1}));
      }
    }
    const customer = customerSnap.data() || {};
    const usage = { ...(customer.discountUsage || {}) };
    if (discountRef && discountSnap?.exists) {
      usage[discountId] = (usage[discountId] || 0) + 1;
      addWrite(() => transaction.update(discountRef, { usedCount: (discountSnap.data()?.usedCount || 0) + 1 }));
    }
    if(gameVoucher?.exists||sharedPrize){
      const voucher=gameVoucher?.data();
      addWrite(() => transaction.create(db.collection('gameConversions').doc(createHash('sha256').update(JSON.stringify(['orderfly',order.brandId,metadata.orderId])).digest('hex')),{brandId:order.brandId,campaignId:voucher?.campaignId||sharedCampaign?.id||order.brandId,channel:'orderfly',orderId:metadata.orderId,playId:voucher?.playId||null,prizeName:voucher?.prizeName||sharedPrize?.name,codeMode:voucher?.codeMode||'shared',amount:Number(order.totalAmount),discountAmount:Number(order.paymentDetails?.discountTotal||0),currency:'DKK',status:'paid',createdAt:serverTimestamp()}));
      if(gameVoucherRef&&voucher?.state==='issued')addWrite(() => transaction.update(gameVoucherRef,{state:'redeemed',redeemedAt:serverTimestamp(),redeemedOrderId:metadata.orderId}));
    }
    if (customerSnap.exists) addWrite(() => transaction.update(customerRef, {
      totalOrders: (customer.totalOrders || 0) + 1,
      totalSpend: (customer.totalSpend || 0) + order.totalAmount,
      lastOrderDate: serverTimestamp(),
      discountUsage: usage,
    }));
    addWrite(() => transaction.update(orderRef, {
      discountReservation: discountId ? 'consumed' : 'none',
      fulfillmentWarnings: [!customerSnap.exists ? 'customer_deleted' : '', discountId && !discountSnap?.exists ? 'discount_deleted' : ''].filter(Boolean),
      ...(session ? { 'psp.checkoutSessionId': session.id, 'psp.paymentIntentId': piId || null } : { paymentCollection }),
      paymentStatus: 'Paid', status: order.status === 'Pending' ? 'Received' : order.status, paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      invoice,
    }));
    if (proof.kind === 'pickup') addWrite(() => transaction.create(db.collection('auditLogs').doc(createHash('sha256').update(JSON.stringify(['pickup-payment', order.brandId, metadata.orderId])).digest('hex')), {
      action: 'pickup_payment_received', brandId: order.brandId, locationId: order.locationId, orderId: metadata.orderId,
      actorId: proof.actor.actorId, actorName: proof.actor.name, method: proof.method, totalAmount: order.totalAmount, createdAt: serverTimestamp(),
    }));
    addWrite(() => transaction.set(counterRef, { brandId: order.brandId, year, lastNumber: sequence, updatedAt: serverTimestamp() }, { merge: true }));
    ensureConfirmation();
    ensureMarketingOrder(invoice.issuedAt);
    return finish(true);
  };
  const fulfilled = await db.runTransaction(async transaction => {
    const context: NativeTransactionContext = Object.freeze({ db, transaction });
    const policy = printIntentsEnabled ? await preparePrintIntentTargetPolicy(context, { brandId: metadata.brandId, locationId: metadata.locationId }) : null;
    // A completed Paid replay uses the original status-agnostic settlement repair.
    // Re-read on every SDK attempt; it must never create or backfill print intent.
    const printTransitionEnabled = policy?.enabled && !isTerminalPaidReplay((await transaction.get(orderRef)).data());
    if (printTransitionEnabled && !stripePrintProof) throw new Error('Print policy changed; verified payment origin required');
    const transition = printTransitionEnabled ? await prepareStripePrintTransition(context, stripePrintProof!) : undefined;
    const prepared = await prepareSettlement(context, transition);
    let printPlan: Awaited<ReturnType<typeof prepareStripeSettlementPrintIntents>> | undefined;
    if (printTransitionEnabled && policy) {
      if (!prepared.capability) throw new Error('Missing private settlement print capability');
      const [catalog, saved] = await Promise.all([
        projectNativePrintCatalog(context, { orderId: metadata.orderId, brandId: metadata.brandId, locationId: metadata.locationId }),
        prepareSavedPrinterRouting(context, { brandId: metadata.brandId, locationId: metadata.locationId }),
      ]);
      if (saved.revision === null || !saved.rules.length) throw new Error('Saved printer routing required');
      const routing = previewPrinterRouting({ scope: catalog.scope, deliveryType: catalog.deliveryType, lines: catalog.lines,
        rules: saved.rules, printers: saved.printers.map(row => ({ configuration: row.configuration, deleted: false })) });
      if (routing.unrouted.length || !routing.targets.length) throw new Error('Order has unrouted print lines');
      const fingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
      const manifestTargets: Array<{ printerId: string; printerRevision: number; configurationHash: string; kinds: Array<'kitchen' | 'packing'>; lineIds: string[] }> = [];
      const intents = routing.targets.flatMap(target => {
        const selected = policy.targets.find(row => row.configuration.id === target.printerId);
        const current = saved.printers.find(row => row.configuration.id === target.printerId);
        if (!selected || !current || selected.printerRevision !== current.revision) throw new Error('Routing target is not enabled by current print policy');
        manifestTargets.push({ printerId: target.printerId, printerRevision: selected.printerRevision,
          configurationHash: fingerprint(selected.configuration), kinds: [...selected.kinds].sort(), lineIds: target.lines.map(line => line.lineId) });
        return selected.kinds.map(kind => ({ brandId: metadata.brandId, locationId: metadata.locationId,
          orderId: metadata.orderId, printerId: target.printerId, kind }));
      });
      printPlan = await prepareStripeSettlementPrintIntents(context, prepared.capability, { intents, identity: {
        schemaVersion: 1, id: 'original', orderId: metadata.orderId, brandId: metadata.brandId, locationId: metadata.locationId,
        originalRevision: 0, policyRevision: policy.policyRevision, routingRevision: saved.revision,
        rulesHash: fingerprint(saved.rules), catalogHash: fingerprint(catalog), targets: manifestTargets,
      } });
    }
    // Every native read is complete before either plan writes. The outbox's
    // intrinsic capability check requires this exact financial plan to apply.
    prepared.apply();
    printPlan?.apply();
    return prepared.fulfilled;
  });
  if (fulfilled && session) {
    // Analytics are optional after an authoritative, idempotent settlement.
    try { await trackServerEvent('payment_succeeded', {
      brandId: metadata.brandId, locationId: metadata.locationId,
      ...(analytics?.sessionId ? {sessionId: analytics.sessionId, deviceType: analytics.deviceType, ...(analytics.attribution || {})} : {}),
      orderId: metadata.orderId, cartValue: (session.amount_total || 0) / 100,
    }); } catch { /* Never report a successful payment as failed due to telemetry. */ }
  }
  return fulfilled;
}
