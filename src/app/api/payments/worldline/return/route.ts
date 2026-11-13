import { after } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { getAdminDb } from '@/lib/firebase-admin';
import { readGuestReceipt } from '@/lib/server/guest-receipt';
import { readPinnedWorldlineAgreement } from '@/lib/payments/worldline-store';
import { readWorldlineTransaction } from '@/lib/payments/worldline-client';
import { assertWorldlineTransaction, worldlineBindingSchema } from '@/lib/payments/worldline-verification';
import { reconcileWorldlineOrder } from '@/lib/payments/worldline-reconcile';
import { isWorldlineCallbackFinanciallyComplete, worldlineNativeTerminalOutcome, waitForWorldlineReturnOutcome } from '@/lib/payments/worldline-callback-completion';
import { brandSlugFromHost, storefrontPath } from '@/lib/brand-subdomain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };
type ReturnStage = 'proof' | 'order' | 'storefront' | 'agreement' | 'transaction' | 'admission' | 'settlement';
class ReturnFailure extends Error { constructor(readonly status: 400 | 403 | 409 | 503) { super('Worldline return unavailable'); } }
function fail(status: 400 | 403 | 409 | 503): never { throw new ReturnFailure(status); }
const incomplete = (stage: ReturnStage, timeout: boolean, retryUrl?: string) => {
  const code = `WORLDLINE_RETURN_${stage.toUpperCase()}_${timeout ? 'TIMEOUT' : 'UNAVAILABLE'}`;
  // Exception-only page: the successful path remains an empty HTTP redirect.
  // The retry link contains only validated native proof fields, never provider
  // return/card/hash parameters, and cannot start a new checkout session.
  const retry = retryUrl ? `<a href="${retryUrl.replaceAll('&', '&amp;')}">Kontrollér samme betaling</a>` : '';
  return new Response(`<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Betalingsstatus | Orderfly</title><style>body{font:1rem system-ui,sans-serif;margin:0;color:#17212b;background:#f7f8fa}main{max-width:36rem;margin:12vh auto;padding:2rem;background:white;border-radius:1rem}h1{font-size:1.6rem}p{line-height:1.6}a{display:inline-block;padding:1rem;background:#087f8c;color:white;border-radius:.5rem;text-decoration:none}small{display:block;margin-top:2rem;overflow-wrap:anywhere}</style><main><p>Orderfly</p><h1>Betalingen er endnu ikke bekræftet</h1><p>Vi kunne ikke hente den endelige betalingsstatus. Betalingen kan stadig være under behandling. Betal ikke igen.</p><p>Kontrollér den samme betaling igen, eller kontakt restauranten med fejlkoden nedenfor.</p>${retry}<small>Fejlkode: ${code}</small></main></html>`, {
    status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '3', 'X-Payment-Error-Code': code },
  });
};
const id = (value: string) => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const txn = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{1,32}$/.test(value);
const slug = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(value);

/** A browser return can choose a lookup ID, never claim payment approval.
 * Its private receipt capability precedes every provider lookup. Only original
 * pinned-account verification can admit a missing callback's durable recovery.
 */
export async function GET(request: Request) {
  // The capture request alone permits 15 seconds. Include provider readback,
  // secret access and the financial commit before declaring an unresolved return.
  const deadline = Date.now() + 60000;
  let stage: ReturnStage = 'proof';
  const url = new URL(request.url), orderId = url.searchParams.get('order_id') || '', receiptToken = url.searchParams.get('receipt_token') || '';
  const transactionHint = url.searchParams.get('txnid');
  if (url.search.length > 16384 || !id(orderId) || !/^[a-f0-9]{64}$/.test(receiptToken) || transactionHint !== null && !txn(transactionHint)
    || url.searchParams.getAll('order_id').length !== 1 || url.searchParams.getAll('receipt_token').length !== 1 || url.searchParams.getAll('txnid').length > 1) return new Response('Betalingsreturen kunne ikke valideres.', { status: 400, headers });
  const retryQuery = new URLSearchParams({ order_id: orderId, receipt_token: receiptToken });
  if (transactionHint) retryQuery.set('txnid', transactionHint);
  const retryUrl = `/api/payments/worldline/return?${retryQuery}`;
  let preparationExpired = false, preparationTimer: ReturnType<typeof setTimeout> | undefined;
  const active = () => { if (preparationExpired || Date.now() >= deadline) fail(503); };
  const read = async <T,>(operation: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      active();
      try { const value = await operation(); active(); return value; }
      catch (error) {
        if (error instanceof ReturnFailure || attempt >= 2) throw error;
        // Only this read operation is repeated, never capture or a money mutation.
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  };
  try {
    const prepare = async () => {
      const receipt = await read(() => readGuestReceipt({ orderId, receiptToken }, { reconcilePayment: false }));
      active();
      if (!receipt || receipt.paymentMethod !== 'Worldline') fail(403);
      stage = 'order';
      const db = getAdminDb(), ref = db.collection('orders').doc(orderId), order = (await read(() => ref.get())).data();
      active();
      if (!order || order.id !== orderId || order.brandId !== receipt.brandId || order.locationId !== receipt.locationId
        || order.paymentMethod !== 'Worldline' || order.psp?.provider !== 'worldline'
        || !/^[a-f0-9]{64}$/.test(order.receiptTokenHash || '')
        || !timingSafeEqual(Buffer.from(order.receiptTokenHash, 'hex'), createHash('sha256').update(receiptToken).digest())) fail(403);
      const parsedBinding = worldlineBindingSchema.safeParse(order.paymentAgreement);
      if (!parsedBinding.success) fail(403);
      const binding = parsedBinding.data;
      if (binding.owner.brandId !== order.brandId || binding.owner.locationId && binding.owner.locationId !== order.locationId) fail(403);
      const transactionId = order.psp.transactionId || transactionHint;
      if (!txn(transactionId) || transactionHint && transactionHint !== transactionId) fail(409);
      const amountMinor = Math.round(order.totalAmount * 100);
      if (typeof order.totalAmount !== 'number' || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) fail(403);
      stage = 'storefront';
      const [brand, location] = await read(() => Promise.all([db.collection('brands').doc(order.brandId).get(), db.collection('locations').doc(order.locationId).get()]));
      active();
      const brandData = brand.data(), locationData = location.data();
      if (!brand.exists || !location.exists || locationData?.brandId !== order.brandId || !slug(brandData?.slug) || !slug(locationData?.slug)) fail(403);
      // Relative canonical target stays on this storefront; no supplied return URL is consumed.
      const onSubdomain = brandSlugFromHost(request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host) === brandData.slug;
      const path = storefrontPath(brandData.slug, onSubdomain, locationData.slug, 'checkout', 'confirmation');
      const target = `${path}?${new URLSearchParams({ order_id: orderId, receipt_token: receiptToken })}`;
      const expected = { orderId, brandId: order.brandId, locationId: order.locationId, transactionId, amountMinor, binding };
      let pinned: Awaited<ReturnType<typeof readPinnedWorldlineAgreement>> | undefined;
      const account = async () => {
        if (!pinned) {
          stage = 'agreement';
          const result = await read(() => readPinnedWorldlineAgreement(binding));
          if (!isDeepStrictEqual(result.binding, binding)) fail(403);
          pinned = result;
        }
        return pinned;
      };
      const terminalOutcome = async (value: unknown) => {
        const terminal = worldlineNativeTerminalOutcome(value, expected);
        if (!terminal) return null;
        const original = await account();
        stage = 'transaction';
        const transaction = assertWorldlineTransaction(await read(() => readWorldlineTransaction(original.credentials, binding.mode, transactionId)), {
          orderId, transactionId, merchantNumber: binding.merchantNumber, mode: binding.mode, amountMinor, currency: 'DKK',
        });
        const refundMinor = (value as Record<string, any>).refundedAmountOre;
        if (terminal !== 'canceled' ? transaction.status.toLowerCase() !== 'approved'
          || transaction.total.captured !== amountMinor || transaction.total.credited !== refundMinor
          : transaction.status.toLowerCase() !== 'deleted' || transaction.total.captured !== 0 || transaction.total.credited !== 0) fail(409);
        // The receipt capability and native terminal state must still match after
        // provider I/O; no capture/refund/cancel operation is initiated here.
        const current = (await read(() => ref.get())).data();
        return worldlineNativeTerminalOutcome(current, expected) === terminal
          && (terminal === 'canceled' || current?.refundedAmountOre === refundMinor) ? terminal : null;
      };
      if (isWorldlineCallbackFinanciallyComplete(order, expected)) return { expected, ref, target, terminalOutcome, complete: true, observeOnly: false };
      if (worldlineNativeTerminalOutcome(order, expected)) {
        if (await terminalOutcome(order)) return { expected, ref, target, terminalOutcome, complete: true, observeOnly: false };
        fail(409);
      }
      const terminalInFlight = (order.status === 'Canceled' || order.paymentStatus === 'Failed') && !!order.paymentOperation;
      if ((order.status === 'Canceled' || order.paymentStatus === 'Failed') && !terminalInFlight) fail(409);
      const original = await account();
      stage = 'transaction';
      const rawObservation = await read(() => readWorldlineTransaction(original.credentials, binding.mode, transactionId));
      let observation;
      try { observation = assertWorldlineTransaction(rawObservation, {
        orderId, transactionId, merchantNumber: binding.merchantNumber, mode: binding.mode, amountMinor, currency: 'DKK',
      }); } catch { fail(409); }
      active();
      if (observation.status.toLowerCase() !== 'approved') {
        if (await terminalOutcome((await read(() => ref.get())).data())) return { expected, ref, target, terminalOutcome, complete: true, observeOnly: false };
        fail(409);
      }
      if (observation.total.credited !== 0 || terminalInFlight) {
        const current = (await read(() => ref.get())).data();
        if (await terminalOutcome(current)) return { expected, ref, target, terminalOutcome, complete: true, observeOnly: false };
        // Provider credit can precede the atomic native refund accounting. Wait
        // for its original native outcome; never capture/reconcile this payment
        // merely because a browser returned during that narrow window.
        if (!current || current.id !== orderId || current.brandId !== order.brandId || current.locationId !== order.locationId
          || current.paymentMethod !== 'Worldline' || current.psp?.provider !== 'worldline' || current.psp.transactionId !== transactionId
          || current.receiptTokenHash !== order.receiptTokenHash || current.totalAmount !== order.totalAmount
          || !isDeepStrictEqual(current.paymentAgreement, binding)) fail(409);
        return { expected, ref, target, terminalOutcome, complete: false, observeOnly: true };
      }
      stage = 'admission';
      const job = db.collection('worldlinePaymentJobs').doc(orderId);
      try { await db.runTransaction(async tx => {
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
      }); } catch (error) {
        if (error instanceof ReturnFailure && error.status === 409 && await terminalOutcome((await read(() => ref.get())).data()))
          return { expected, ref, target, terminalOutcome, complete: true, observeOnly: false };
        throw error;
      }
      active();
      return { expected, ref, target, terminalOutcome, complete: false, observeOnly: false };
    };
    const prepared = await Promise.race([
      prepare(),
      new Promise<undefined>(resolve => { preparationTimer = setTimeout(() => { preparationExpired = true; resolve(undefined); }, Math.max(0, deadline - Date.now())); }),
    ]);
    clearTimeout(preparationTimer);
    if (!prepared) return incomplete(stage, true, retryUrl);
    if (!prepared.complete) {
      // Use the original journalled reconciliation once. Another callback may
      // already own its capture; native observation below can await that commit
      // without issuing another financial request or retrying an uncertain write.
      stage = 'settlement';
      let gateFinished = false;
      const work = prepared.observeOnly ? Promise.resolve() : (async () => {
        // There is one normal reconciliation. Every later pass is explicitly
        // observation-only: it can confirm a lost capture reply's original
        // journal and commit verified settlement, never send another capture.
        try { await reconcileWorldlineOrder(orderId, { retryReadFailures: true }); } catch { /* Observe the durable outcome below. */ }
        while (!gateFinished && Date.now() < deadline) {
          try {
            const current = (await prepared.ref.get()).data();
            if (isWorldlineCallbackFinanciallyComplete(current, prepared.expected)) return;
            if (!current || current.id !== prepared.expected.orderId || current.brandId !== prepared.expected.brandId
              || current.locationId !== prepared.expected.locationId || current.paymentStatus !== 'Pending' || current.status === 'Canceled'
              || current.paymentMethod !== 'Worldline' || current.psp?.provider !== 'worldline' || current.psp.transactionId !== prepared.expected.transactionId
              || !isDeepStrictEqual(current.paymentAgreement, prepared.expected.binding) || typeof current.totalAmount !== 'number'
              || Math.round(current.totalAmount * 100) !== prepared.expected.amountMinor
              || current.refundedAmountOre || current.refundedAmount || current.refundedAt
              || current.paymentOperation && current.paymentOperation !== createHash('sha256').update('initial-capture').digest('hex')) return;
            await reconcileWorldlineOrder(orderId, { observationOnly: true });
          } catch { /* A read failure is not permission to repeat a money request. */ }
          if (!gateFinished && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
        }
      })();
      try { after(async () => { await work; }); } catch { /* Durable admission still owns recovery. */ }
      let complete;
      try { complete = await waitForWorldlineReturnOutcome({ expected: prepared.expected, terminalOutcome: prepared.terminalOutcome,
        readOrder: async () => (await prepared.ref.get()).data(), work, timeoutMs: Math.max(0, deadline - Date.now()),
        pollIntervalMs: 250, stopWhenWorkFinishes: false, retryReadFailures: true }); }
      finally { gateFinished = true; }
      if (!complete) return incomplete(stage, true, retryUrl);
    }
    return new Response(null, { status: 302, headers: { ...headers, Location: prepared.target } });
  } catch (error) {
    if (error instanceof ReturnFailure && error.status !== 503) return new Response('Betalingsreturen kunne ikke valideres.', { status: error.status, headers });
    return incomplete(stage, preparationExpired || Date.now() >= deadline, retryUrl);
  } finally { clearTimeout(preparationTimer); }
}
