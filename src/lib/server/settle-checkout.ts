import 'server-only';
import type Stripe from 'stripe';
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
  const fulfilled = await db.runTransaction(async transaction => {
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
      if (!confirmation.exists && order.status !== 'Canceled') transaction.set(confirmationRef, {
        orderId: metadata.orderId, brandId: order.brandId, locationId: order.locationId,
        kind: 'orderConfirmation', state: 'pending', eventId: randomUUID(), nextAttemptAt: Date.now(), attempts: 0, createdAt: Date.now(), updatedAt: Date.now(),
      });
    };
    const ensureMarketingOrder = (eventTime: string) => {
      if (!marketingEnabled) return;
      const customer = customerSnap.data();
      const customerEmail = typeof customer?.email === 'string' ? customer.email.trim().toLowerCase() : '';
      if (!marketingOrder?.exists && order.status !== 'Canceled' && customerSnap.exists && customer?.brandId === order.brandId && customer?.marketingConsent === true && customerEmail && customerEmail === String(order.customerContact || '').trim().toLowerCase()) transaction.set(marketingOrderRef, {
        orderId: metadata.orderId, brandId: order.brandId, locationId: order.locationId, customerId: order.customerDetails.id,
        kind: 'paidOrder', state: 'pending', eventId: randomUUID(), eventTime, nextAttemptAt: Date.now(), attempts: 0, createdAt: Date.now(), updatedAt: Date.now(),
      });
    };
    // A legacy path could mark Paid without the outbox job. Repair only this
    // verified session's missing job, without replaying financial accounting.
    if (order.paymentStatus === 'Paid') {
      if (session && order.psp?.checkoutSessionId !== session.id) throw new Error('Payment scope mismatch');
      ensureConfirmation();
      if (order.invoice) ensureMarketingOrder(order.invoice.issuedAt);
      return false;
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
    settleCapacity();
    // Counters and Paid transition commit atomically. A repeated webhook takes
    // the Paid branch above and cannot count these offers again.
    for (const {ref,snapshot} of upsellRecords) {
      const offer = snapshot.data();
      if (snapshot.exists && offer && offer.brandId === order.brandId && Array.isArray(offer.locationIds) && offer.locationIds.includes(order.locationId)) {
        transaction.update(ref,{conversions:Math.max(0,Number(offer.conversions)||0)+1});
      }
    }
    const customer = customerSnap.data() || {};
    const usage = { ...(customer.discountUsage || {}) };
    if (discountRef && discountSnap?.exists) {
      usage[discountId] = (usage[discountId] || 0) + 1;
      transaction.update(discountRef, { usedCount: (discountSnap.data()?.usedCount || 0) + 1 });
    }
    if(gameVoucher?.exists||sharedPrize){
      const voucher=gameVoucher?.data();
      transaction.create(db.collection('gameConversions').doc(createHash('sha256').update(JSON.stringify(['orderfly',order.brandId,metadata.orderId])).digest('hex')),{brandId:order.brandId,campaignId:voucher?.campaignId||sharedCampaign?.id||order.brandId,channel:'orderfly',orderId:metadata.orderId,playId:voucher?.playId||null,prizeName:voucher?.prizeName||sharedPrize?.name,codeMode:voucher?.codeMode||'shared',amount:Number(order.totalAmount),discountAmount:Number(order.paymentDetails?.discountTotal||0),currency:'DKK',status:'paid',createdAt:serverTimestamp()});
      if(gameVoucherRef&&voucher?.state==='issued')transaction.update(gameVoucherRef,{state:'redeemed',redeemedAt:serverTimestamp(),redeemedOrderId:metadata.orderId});
    }
    if (customerSnap.exists) transaction.update(customerRef, {
      totalOrders: (customer.totalOrders || 0) + 1,
      totalSpend: (customer.totalSpend || 0) + order.totalAmount,
      lastOrderDate: serverTimestamp(),
      discountUsage: usage,
    });
    transaction.update(orderRef, {
      discountReservation: discountId ? 'consumed' : 'none',
      fulfillmentWarnings: [!customerSnap.exists ? 'customer_deleted' : '', discountId && !discountSnap?.exists ? 'discount_deleted' : ''].filter(Boolean),
      ...(session ? { 'psp.checkoutSessionId': session.id, 'psp.paymentIntentId': piId || null } : { paymentCollection }),
      paymentStatus: 'Paid', status: order.status === 'Pending' ? 'Received' : order.status, paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      invoice,
    });
    if (proof.kind === 'pickup') transaction.create(db.collection('auditLogs').doc(createHash('sha256').update(JSON.stringify(['pickup-payment', order.brandId, metadata.orderId])).digest('hex')), {
      action: 'pickup_payment_received', brandId: order.brandId, locationId: order.locationId, orderId: metadata.orderId,
      actorId: proof.actor.actorId, actorName: proof.actor.name, method: proof.method, totalAmount: order.totalAmount, createdAt: serverTimestamp(),
    });
    transaction.set(counterRef, { brandId: order.brandId, year, lastNumber: sequence, updatedAt: serverTimestamp() }, { merge: true });
    ensureConfirmation();
    ensureMarketingOrder(invoice.issuedAt);
    return true;
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
