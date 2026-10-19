import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { NotificationPlatformClient, NotificationPlatformError } from './platform';
import { locationAddress } from '@/lib/order-invoice';

const never = Number.MAX_SAFE_INTEGER;
const leaseMs = 120000;
const validEmail = (value: unknown): value is string => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
type OrderNotificationJob = { orderId: string; brandId: string; locationId: string; eventId: string; lease: string; attempts?: number; kind?: string };
// A pay-at-pickup order is mailed once accepted and still unpaid; it gets the paid confirmation when it is paid.
const pickupUnpaid = (order: Record<string, any>) => order.paymentMethod === 'PayAtPickup' && order.deliveryType === 'Pickup' && !order.psp && order.paymentStatus === 'Pending' && !['Pending', 'Canceled'].includes(order.status);

export async function runOrderNotificationWorker(makeClient = () => new NotificationPlatformClient(), now = Date.now()) {
  const db = getAdminDb();
  const due = await db.collection('orderNotificationJobs').where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt').limit(10).get();
  const counts = { processed: 0, accepted: 0, suppressed: 0, uncertain: 0, failed: 0 };
  for (const doc of due.docs) {
    const ref = db.collection('orderNotificationJobs').doc(doc.id), lease = randomUUID();
    const job = await db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      if (!data || data.nextAttemptAt > now) return null;
      if (data.state === 'dispatching') {
        tx.update(ref, { state: 'uncertain', lease: null, nextAttemptAt: never, lastError: 'provider_result_unknown', updatedAt: now });
        return 'recovered_uncertain' as const;
      }
      if (!['pending', 'preparing'].includes(data.state)) return null;
      tx.update(ref, { state: 'preparing', lease, nextAttemptAt: now + leaseMs, updatedAt: now });
      return { ...data, lease } as OrderNotificationJob;
    });
    if (!job) continue;
    counts.processed++;
    if (job === 'recovered_uncertain') { counts.uncertain++; continue; }
    const finish = async (state: string, lastError: string | null = null, retry = false) => db.runTransaction(async tx => {
      const current = (await tx.get(ref)).data();
      if (current?.lease !== lease) return;
      const attempts = (current.attempts || 0) + 1;
      tx.update(ref, { state: retry && attempts < 3 ? 'pending' : state, attempts, lease: null, lastError, updatedAt: Date.now(), nextAttemptAt: retry && attempts < 3 ? Date.now() + 60000 : never, ...(state === 'accepted' ? { acceptedAt: Date.now() } : {}) });
    });
    let dispatched = false;
    try {
      const orderRef = db.collection('orders').doc(String(job.orderId || ''));
      const orderDoc = await orderRef.get();
      const order = orderDoc.data();
      const pickup = job.kind === 'pickupReceived';
      const eligible = (current: Record<string, any> | undefined): current is Record<string, any> => !!current &&
        (pickup ? pickupUnpaid(current) : current.paymentStatus === 'Paid' && current.status !== 'Canceled') &&
        current.brandId === job.brandId && current.locationId === job.locationId && validEmail(current.customerContact);
      if (!eligible(order)) {
        await finish('suppressed', 'order_not_eligible'); counts.suppressed++; continue;
      }
      // The pickup address comes from the order's own location; read it before dispatch so a failed read can retry.
      let pickupAddress = '';
      if (pickup) {
        let location: Record<string, any> | undefined;
        try { location = (await db.collection('locations').doc(String(order.locationId)).get()).data(); }
        catch { await finish('failed', 'location_read_failed', true); counts.failed++; continue; }
        if (!location || location.brandId !== job.brandId) { await finish('suppressed', 'location_not_eligible'); counts.suppressed++; continue; }
        pickupAddress = locationAddress(location);
      }
      // Payment, cancellation or a location move can land while the location is read; recheck both as the job is claimed.
      const locationRef = db.collection('locations').doc(String(order.locationId));
      const ownsLease = await db.runTransaction(async tx => {
        const [current, latest, place] = await Promise.all([tx.get(ref), tx.get(orderRef), pickup ? tx.get(locationRef) : null]);
        if (current.data()?.lease !== lease || current.data()?.state !== 'preparing') return false;
        if (!eligible(latest.data())) return 'ineligible' as const;
        if (place && (!place.data() || place.data()?.brandId !== job.brandId)) return 'location' as const;
        tx.update(ref, { state: 'dispatching', nextAttemptAt: Date.now() + leaseMs, updatedAt: Date.now() }); return true;
      });
      if (ownsLease === 'ineligible') { await finish('suppressed', 'order_not_eligible'); counts.suppressed++; continue; }
      if (ownsLease === 'location') { await finish('suppressed', 'location_not_eligible'); counts.suppressed++; continue; }
      if (!ownsLease) continue;
      if (pickup) {
        dispatched = true;
        await makeClient().send({
          idempotencyKey: String(job.eventId), templateKey: 'orderfly.order.received_pay_at_pickup', locale: 'da',
          recipientEmail: order.customerContact.trim().toLowerCase(), recipientName: String(order.customerName || ''),
          relatedEntity: { type: 'commerce_order', id: orderDoc.id },
          variables: {
            orderId: orderDoc.id, customerName: String(order.customerName || ''), brandName: String(order.brandName || ''), locationName: String(order.locationName || ''),
            deliveryTime: String(order.deliveryTime || ''), totalAmount: Number(order.totalAmount || 0), currency: 'DKK', fulfillmentAddress: pickupAddress,
          },
        });
        await finish('accepted'); counts.accepted++; continue;
      }
      dispatched = true;
      const invoice = order.invoice;
      if (invoice && (!invoice.number || !Array.isArray(invoice.lines))) {
        await finish('failed', 'invoice_snapshot_missing'); counts.failed++; continue;
      }
      await makeClient().send({
        idempotencyKey: String(job.eventId), templateKey: 'orderfly.order.confirmation', locale: 'da',
        recipientEmail: order.customerContact.trim().toLowerCase(), recipientName: String(order.customerName || ''),
        relatedEntity: { type: 'commerce_order', id: orderDoc.id },
        variables: {
          orderId: orderDoc.id, customerName: String(order.customerName || ''), brandName: String(order.brandName || ''), locationName: String(order.locationName || ''),
          deliveryType: String(order.deliveryType || ''), deliveryTime: String(order.deliveryTime || ''), totalAmount: Number(order.totalAmount || 0), currency: String(invoice?.currency || 'DKK'),
          ...(invoice ? {
          invoiceNumber: String(invoice.number), invoiceIssuedAt: String(invoice.issuedAt), supplyDate: String(invoice.supplyDate),
          sellerLegalName: String(invoice.seller?.legalName || ''), sellerTradingName: String(invoice.seller?.tradingName || ''), sellerRegistrationNumber: String(invoice.seller?.registrationNumber || ''), sellerAddress: String(invoice.seller?.address || ''), sellerEmail: String(invoice.seller?.email || ''),
          fulfillmentAddress: String(invoice.fulfillmentLocation?.address || ''), customerAddress: String(invoice.customer?.address || ''),
          invoiceLinesJson: JSON.stringify(invoice.lines), subtotal: Number(invoice.subtotal || 0), itemDiscount: Number(invoice.itemDiscount || 0), orderDiscount: Number(invoice.orderDiscount || 0), deliveryFee: Number(invoice.deliveryFee || 0), bagFee: Number(invoice.bagFee || 0), adminFee: Number(invoice.adminFee || 0), taxableAmount: Number(invoice.taxableAmount || 0), vatRate: Number(invoice.vatRate || 0), vatAmount: Number(invoice.vatAmount || 0), paymentMethod: String(invoice.paymentMethod || 'Stripe'),
          } : {}),
        },
      });
      await finish('accepted'); counts.accepted++;
    } catch (error) {
      const known = error instanceof NotificationPlatformError ? error : new NotificationPlatformError(dispatched ? 'provider_result_unknown' : 'provider_preflight_failed', dispatched, false);
      const state = known.uncertain ? 'uncertain' : 'failed';
      await finish(state, known.code, known.retryable); counts[state]++;
    }
  }
  return counts;
}
