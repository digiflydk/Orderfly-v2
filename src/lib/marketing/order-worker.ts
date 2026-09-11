import 'server-only';
import { randomUUID } from 'node:crypto';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { Customer, OrderDetail } from '@/types';
import { marketingConfig, paidOrderMarketingEnabled } from './config';
import { contactKey } from './store';
import { buildPaidOrderEvent, normalizedEmail, type PaidOrderJob } from './order-event';
import { MarketingError, Omnisend } from './provider';

const NEVER = Number.MAX_SAFE_INTEGER, LEASE = 120000;
const retryDelay = (attempt: number) => Math.min(6 * 60 * 60 * 1000, 60000 * 2 ** Math.max(0, attempt - 1));
function failureOf(error: unknown) {
  if (error instanceof MarketingError) return error;
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && /^[a-z0-9_]+$/.test(error.code)) {
    return new MarketingError(error.code, 'retryable' in error && error.retryable === true, 'uncertain' in error && error.uncertain === true);
  }
  return new MarketingError('order_event_failed', false);
}

async function lease(db: Firestore, ref: DocumentReference, now: number) {
  const token = randomUUID();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), data = snap.data() as PaidOrderJob | undefined;
    if (!data || data.nextAttemptAt > now) return null;
    if (data.state === 'dispatching') {
      tx.update(ref, { state: 'uncertain', lease: null, nextAttemptAt: NEVER, lastError: 'dispatch_outcome_unknown', updatedAt: now });
      return null;
    }
    if (!['pending', 'failed'].includes(data.state)) return null;
    tx.update(ref, { lease: token, nextAttemptAt: now + LEASE, updatedAt: now });
    return { ...data, lease: token };
  });
}

async function finish(db: Firestore, ref: DocumentReference, token: string, state: PaidOrderJob['state'], now: number, error?: string, retryable = false) {
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref), current = snap.data();
    if (!current || current.lease !== token) return;
    const attempts = Number(current.attempts || 0) + 1;
    tx.update(ref, {
      state, attempts, lease: null, lastError: error || null, updatedAt: now,
      nextAttemptAt: state === 'failed' && retryable && attempts < 8 ? now + retryDelay(attempts) : NEVER,
    });
  });
}

async function defer(db: Firestore, ref: DocumentReference, token: string, now: number) {
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.data()?.lease === token) tx.update(ref, { state: 'pending', lease: null, nextAttemptAt: now + 60000, lastError: 'contact_not_ready', updatedAt: now });
  });
}

export async function runMarketingOrderWorker(db: Firestore, now = Date.now(), makeProvider = (config: NonNullable<ReturnType<typeof marketingConfig>>) => new Omnisend(config), deadline = Date.now() + 45000) {
  const counts = { processed: 0, accepted: 0, failed: 0, uncertain: 0, suppressed: 0, deferred: 0 };
  if (!paidOrderMarketingEnabled()) return counts;
  const jobs = await db.collection('marketingOrderOutbox').where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt').limit(10).get();
  for (const snap of jobs.docs) {
    if (Date.now() + 15000 >= deadline) break;
    const job = await lease(db, snap.ref, now);
    if (!job) continue;
    let dispatchStarted = false;
    try {
      const [orderSnap, customerSnap] = await Promise.all([
        db.collection('orders').doc(job.orderId).get(), db.collection('customers').doc(job.customerId).get(),
      ]);
      const order = orderSnap.data() as OrderDetail | undefined, customer = customerSnap.data() as Customer | undefined;
      if (!order || !customer || order.brandId !== job.brandId || order.locationId !== job.locationId || customer.brandId !== job.brandId || order.customerDetails?.id !== job.customerId || order.paymentStatus !== 'Paid' || order.status === 'Canceled' || !order.invoice || customer.marketingConsent !== true || normalizedEmail(customer.email) !== normalizedEmail(order.customerContact)) {
        await finish(db, snap.ref, job.lease, 'suppressed', Date.now(), 'order_or_consent_ineligible'); counts.suppressed++; counts.processed++; continue;
      }
      const key = contactKey(job.brandId, customer.email);
      const contactRef = db.collection('marketingContacts').doc(key);
      const contact = (await contactRef.get()).data();
      if (!contact || contact.brandId !== job.brandId || contact.customerId !== job.customerId || ['pending', 'failed'].includes(contact.state)) {
        await defer(db, snap.ref, job.lease, Date.now()); counts.deferred++; counts.processed++; continue;
      }
      if (contact.state !== 'synced' || contact.providerStatus === 'unsubscribed') {
        await finish(db, snap.ref, job.lease, 'suppressed', Date.now(), 'contact_suppressed'); counts.suppressed++; counts.processed++; continue;
      }
      const config = marketingConfig(job.brandId);
      if (!config) throw new MarketingError('configuration_required', false);
      const provider = makeProvider(config);
      await provider.verifyBrand();
      if (Date.now() + 10000 >= deadline) {
        await defer(db, snap.ref, job.lease, Date.now()); counts.deferred++; counts.processed++; continue;
      }
      // Revalidate after provider I/O, atomically with the dispatch transition.
      const dispatch = await db.runTransaction(async tx => {
        const [current, freshOrderSnap, freshCustomerSnap, freshContactSnap] = await Promise.all([
          tx.get(snap.ref), tx.get(orderSnap.ref), tx.get(customerSnap.ref), tx.get(contactRef),
        ]);
        if (current.data()?.lease !== job.lease) throw new MarketingError('lease_lost', false);
        const freshOrder = freshOrderSnap.data() as OrderDetail | undefined;
        const freshCustomer = freshCustomerSnap.data() as Customer | undefined;
        const freshContact = freshContactSnap.data();
        if (!freshOrder || !freshCustomer || freshOrder.brandId !== job.brandId || freshOrder.locationId !== job.locationId || freshCustomer.brandId !== job.brandId || freshOrder.customerDetails?.id !== job.customerId || freshOrder.paymentStatus !== 'Paid' || freshOrder.status === 'Canceled' || !freshOrder.invoice || freshCustomer.marketingConsent !== true || normalizedEmail(freshCustomer.email) !== normalizedEmail(freshOrder.customerContact) || contactKey(job.brandId, freshCustomer.email) !== key) return { state: 'suppressed' } as const;
        if (!freshContact || freshContact.brandId !== job.brandId || freshContact.customerId !== job.customerId || ['pending','failed'].includes(freshContact.state)) return { state: 'deferred' } as const;
        if (freshContact.state !== 'synced' || freshContact.providerStatus === 'unsubscribed') return { state: 'suppressed' } as const;
        const payload = buildPaidOrderEvent({ ...freshOrder, id: freshOrderSnap.id }, freshOrder.invoice, job, freshCustomer.email);
        tx.update(snap.ref, { state: 'dispatching', updatedAt: Date.now() });
        return { state: 'ready', payload } as const;
      });
      if (dispatch.state === 'suppressed') {
        await finish(db, snap.ref, job.lease, 'suppressed', Date.now(), 'order_or_consent_ineligible'); counts.suppressed++; counts.processed++; continue;
      }
      if (dispatch.state === 'deferred') {
        await defer(db, snap.ref, job.lease, Date.now()); counts.deferred++; counts.processed++; continue;
      }
      dispatchStarted = true;
      await provider.paidOrder(dispatch.payload);
      await finish(db, snap.ref, job.lease, 'accepted', Date.now()); counts.accepted++;
    } catch (error) {
      const failure = failureOf(error);
      const state = dispatchStarted && failure.uncertain ? 'uncertain' : 'failed';
      await finish(db, snap.ref, job.lease, state, Date.now(), failure.code, failure.retryable);
      counts[state]++;
    }
    counts.processed++;
  }
  return counts;
}

export async function retryMarketingOrderJob(db: Firestore, brandId: string, id: string) {
  if (!paidOrderMarketingEnabled()) return false;
  const ref = db.collection('marketingOrderOutbox').doc(id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), job = snap.data();
    if (!job || job.brandId !== brandId || job.state !== 'failed' || job.lease) return false;
    tx.update(ref, { state: 'pending', attempts: 0, nextAttemptAt: Date.now(), lastError: null });
    return true;
  });
}
