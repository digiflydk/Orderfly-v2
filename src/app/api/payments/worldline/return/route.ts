import { after } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { getAdminDb } from '@/lib/firebase-admin';
import { readGuestReceipt } from '@/lib/server/guest-receipt';
import { readPinnedWorldlineAgreement } from '@/lib/payments/worldline-store';
import { readWorldlineTransaction } from '@/lib/payments/worldline-client';
import { assertWorldlineTransaction, worldlineBindingSchema } from '@/lib/payments/worldline-verification';
import { reconcileWorldlineOrder } from '@/lib/payments/worldline-reconcile';
import { isWorldlineCallbackFinanciallyComplete, waitForWorldlineCallbackFinancialCompletion } from '@/lib/payments/worldline-callback-completion';
import { brandSlugFromHost, storefrontPath } from '@/lib/brand-subdomain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };
class ReturnFailure extends Error { constructor(readonly status: 400 | 403 | 409 | 503) { super('Worldline return unavailable'); } }
function fail(status: 400 | 403 | 409 | 503): never { throw new ReturnFailure(status); }
const incomplete = () => new Response('Betalingen er endnu ikke bekræftet. Genindlæs denne side for at kontrollere status. Betal ikke igen.', { status: 503, headers });
const id = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const txn = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
const slug = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(value);

/** A browser return can choose a lookup ID, never claim payment approval.
 * Its private receipt capability precedes every provider lookup. Only original
 * pinned-account verification can admit a missing callback's durable recovery.
 */
export async function GET(request: Request) {
  const deadline = Date.now() + 10000;
  const url = new URL(request.url), orderId = url.searchParams.get('order_id') || '', receiptToken = url.searchParams.get('receipt_token') || '';
  const transactionHint = url.searchParams.get('txnid');
  if (url.search.length > 16384 || !id(orderId) || !/^[a-f0-9]{64}$/.test(receiptToken) || transactionHint !== null && !txn(transactionHint)
    || url.searchParams.getAll('order_id').length !== 1 || url.searchParams.getAll('receipt_token').length !== 1 || url.searchParams.getAll('txnid').length > 1) return new Response('Betalingsreturen kunne ikke valideres.', { status: 400, headers });
  let preparationExpired = false, preparationTimer: ReturnType<typeof setTimeout> | undefined;
  const active = () => { if (preparationExpired || Date.now() >= deadline) fail(503); };
  try {
    const prepare = async () => {
      const receipt = await readGuestReceipt({ orderId, receiptToken }, { reconcilePayment: false });
      active();
      if (!receipt || receipt.paymentMethod !== 'Worldline') fail(403);
      const db = getAdminDb(), ref = db.collection('orders').doc(orderId), order = (await ref.get()).data();
      active();
      if (!order || order.id !== orderId || order.brandId !== receipt.brandId || order.locationId !== receipt.locationId
        || order.paymentMethod !== 'Worldline' || order.psp?.provider !== 'worldline'
        || !/^[a-f0-9]{64}$/.test(order.receiptTokenHash || '')
        || !timingSafeEqual(Buffer.from(order.receiptTokenHash, 'hex'), createHash('sha256').update(receiptToken).digest())) fail(403);
      if (order.status === 'Canceled' || order.paymentStatus === 'Failed') fail(409);
      const parsedBinding = worldlineBindingSchema.safeParse(order.paymentAgreement);
      if (!parsedBinding.success) fail(403);
      const binding = parsedBinding.data;
      if (binding.owner.brandId !== order.brandId || binding.owner.locationId && binding.owner.locationId !== order.locationId) fail(403);
      const transactionId = order.psp.transactionId || transactionHint;
      if (!txn(transactionId) || transactionHint && transactionHint !== transactionId) fail(409);
      const amountMinor = Math.round(order.totalAmount * 100);
      if (typeof order.totalAmount !== 'number' || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) fail(403);
      const [brand, location] = await Promise.all([db.collection('brands').doc(order.brandId).get(), db.collection('locations').doc(order.locationId).get()]);
      active();
      const brandData = brand.data(), locationData = location.data();
      if (!brand.exists || !location.exists || locationData?.brandId !== order.brandId || !slug(brandData?.slug) || !slug(locationData?.slug)) fail(403);
      // Relative canonical target stays on this storefront; no supplied return URL is consumed.
      const onSubdomain = brandSlugFromHost(request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host) === brandData.slug;
      const path = storefrontPath(brandData.slug, onSubdomain, locationData.slug, 'checkout', 'confirmation');
      const target = `${path}?${new URLSearchParams({ order_id: orderId, receipt_token: receiptToken })}`;
      const expected = { orderId, brandId: order.brandId, locationId: order.locationId, transactionId, amountMinor, binding };
      if (isWorldlineCallbackFinanciallyComplete(order, expected)) return { expected, ref, target, complete: true };
      const pinned = await readPinnedWorldlineAgreement(binding);
      active();
      if (!isDeepStrictEqual(pinned.binding, binding)) fail(403);
      const observation = assertWorldlineTransaction(await readWorldlineTransaction(pinned.credentials, binding.mode, transactionId), {
        orderId, transactionId, merchantNumber: binding.merchantNumber, mode: binding.mode, amountMinor, currency: 'DKK',
      });
      active();
      if (observation.status.toLowerCase() !== 'approved' || observation.total.credited !== 0) fail(409);
      const job = db.collection('worldlinePaymentJobs').doc(orderId);
      await db.runTransaction(async tx => {
        const [current, previous] = await Promise.all([tx.get(ref), tx.get(job)]);
        active();
        const value = current.data(), prior = previous.data();
        if (!value || value.id !== orderId || value.brandId !== order.brandId || value.locationId !== order.locationId
          || value.paymentMethod !== 'Worldline' || value.psp?.provider !== 'worldline' || value.receiptTokenHash !== order.receiptTokenHash
          || value.totalAmount !== order.totalAmount || !isDeepStrictEqual(value.paymentAgreement, order.paymentAgreement)
          || value.psp.transactionId && value.psp.transactionId !== transactionId || value.status === 'Canceled' || value.paymentStatus === 'Failed') fail(409);
        if (previous.exists) {
          if (!prior || prior.transactionId !== transactionId || prior.brandId !== order.brandId || prior.locationId !== order.locationId) fail(409);
        } else {
          tx.create(job, { orderId, brandId: order.brandId, locationId: order.locationId, transactionId, state: 'pending', nextAttemptAt: Date.now(), attempts: 0, createdAt: Date.now(), updatedAt: Date.now() });
        }
        if (!value.psp.transactionId) tx.update(ref, { 'psp.transactionId': transactionId });
      });
      active();
      return { expected, ref, target, complete: false };
    };
    const prepared = await Promise.race([
      prepare(),
      new Promise<undefined>(resolve => { preparationTimer = setTimeout(() => { preparationExpired = true; resolve(undefined); }, Math.max(0, deadline - Date.now())); }),
    ]);
    clearTimeout(preparationTimer);
    if (!prepared) return incomplete();
    if (!prepared.complete) {
      // Use the original journalled reconciliation once. Another callback may
      // already own its capture; native observation below can await that commit
      // without issuing another financial request or retrying an uncertain write.
      const work = Promise.resolve().then(() => reconcileWorldlineOrder(orderId)).catch(() => { /* Durable worker owns recovery. */ });
      try { after(async () => { await work; }); } catch { /* Durable admission still owns recovery. */ }
      const complete = await waitForWorldlineCallbackFinancialCompletion({ expected: prepared.expected,
        readOrder: async () => (await prepared.ref.get()).data(), work, timeoutMs: Math.max(0, deadline - Date.now()), stopWhenWorkFinishes: false });
      if (!complete) return incomplete();
    }
    return new Response(null, { status: 302, headers: { ...headers, Location: prepared.target } });
  } catch (error) {
    if (error instanceof ReturnFailure && error.status !== 503) return new Response('Betalingsreturen kunne ikke valideres.', { status: error.status, headers });
    return incomplete();
  } finally { clearTimeout(preparationTimer); }
}
