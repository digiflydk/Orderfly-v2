import 'server-only';
import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { NotificationPlatformClient, NotificationPlatformError } from './platform';

const never = Number.MAX_SAFE_INTEGER;
const leaseMs = 120000;
const validEmail = (value: unknown): value is string => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
type OrderNotificationJob = { orderId: string; brandId: string; locationId: string; eventId: string; lease: string; attempts?: number };

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
      const orderDoc = await db.collection('orders').doc(String(job.orderId || '')).get();
      const order = orderDoc.data();
      if (!order || order.paymentStatus !== 'Paid' || order.status === 'Canceled' || order.brandId !== job.brandId || order.locationId !== job.locationId || !validEmail(order.customerContact)) {
        await finish('suppressed', 'order_not_eligible'); counts.suppressed++; continue;
      }
      const ownsLease = await db.runTransaction(async tx => {
        const current = (await tx.get(ref)).data();
        if (current?.lease !== lease || current.state !== 'preparing') return false;
        tx.update(ref, { state: 'dispatching', nextAttemptAt: Date.now() + leaseMs, updatedAt: Date.now() }); return true;
      });
      if (!ownsLease) continue;
      dispatched = true;
      await makeClient().send({
        idempotencyKey: String(job.eventId), templateKey: 'orderfly.order.confirmation', locale: 'da',
        recipientEmail: order.customerContact.trim().toLowerCase(), recipientName: String(order.customerName || ''),
        relatedEntity: { type: 'commerce_order', id: orderDoc.id },
        variables: { orderId: orderDoc.id, customerName: String(order.customerName || ''), brandName: String(order.brandName || ''), locationName: String(order.locationName || ''), deliveryType: String(order.deliveryType || ''), deliveryTime: String(order.deliveryTime || ''), totalAmount: Number(order.totalAmount || 0), currency: 'DKK' },
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
