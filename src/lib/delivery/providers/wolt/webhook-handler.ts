import 'server-only';
import { normalizeWoltEvent, type NormalizedWoltEvent } from './events';
import { verifyWoltWebhook, WOLT_WEBHOOK_MAX_BYTES, WoltWebhookError } from './webhook-verify';

export interface WoltWebhookBinding {
  merchantId: string;
  active: boolean;
  secret: string;
}
export interface WoltEventTarget {
  brandId: string; locationId: string; merchantId: string; venueId: string;
  nativeOrderReference: string; providerDeliveryId: string; attemptRef: string;
}
export interface WoltWebhookDependencies {
  /** Opaque callback key is resolved server-side; no caller-supplied merchant secret. */
  resolveCallbackBinding(callbackKey: string): Promise<WoltWebhookBinding | null>;
  /** Resolve only an existing attempt belonging to this merchant/order. Never trust merchantOrderReference alone. */
  resolveAttempt(merchantId: string, nativeOrderReference: string): Promise<WoltEventTarget | null>;
  /** Must atomically recheck binding/attempt scope, persist unique receipt and apply permitted state update.
   * Replay/out-of-order/terminal conflict policy belongs to shared inbox. Resolve only after durable commit.
   * Conflicts must retain audit and flag reconciliation, not regress terminal status or print/refund again. */
  appendVerifiedEvent(target: WoltEventTarget, event: NormalizedWoltEvent): Promise<'accepted' | 'duplicate' | 'reconciliation_required'>;
  now?: () => number;
}
async function boundedBody(request: Request): Promise<Uint8Array> {
  if (!request.body) throw new WoltWebhookError('invalid_payload');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > WOLT_WEBHOOK_MAX_BYTES) { await reader.cancel(); throw new WoltWebhookError('payload_too_large'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
/** Framework-neutral HTTP boundary; the coordinator installs it only with a real durable inbox. */
export async function handleWoltWebhook(request: Request, callbackKey: string, deps: WoltWebhookDependencies): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return new Response(null, { status: 415 });
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(callbackKey)) return new Response(null, { status: 404 });
  try {
    const binding = await deps.resolveCallbackBinding(callbackKey);
    if (!binding?.active) return new Response(null, { status: 404 });
    const now = (deps.now ?? Date.now)();
    const event = verifyWoltWebhook(await boundedBody(request), binding.secret, now);
    const target = await deps.resolveAttempt(binding.merchantId, event.details.wolt_order_reference_id);
    // An event may race create persistence; retry until the authoritative mapping exists.
    if (!target) return new Response(null, { status: 503 });
    if (target.merchantId !== binding.merchantId || target.nativeOrderReference !== event.details.wolt_order_reference_id ||
        (event.details.venue_id !== undefined && target.venueId !== event.details.venue_id) ||
        !target.brandId || !target.locationId || !target.providerDeliveryId || !target.attemptRef) return new Response(null, { status: 403 });
    const normalized = normalizeWoltEvent(event, binding.merchantId, new Date(now).toISOString());
    await deps.appendVerifiedEvent(target, normalized);
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof WoltWebhookError) return new Response(null, { status: error.code === 'payload_too_large' ? 413 : error.code === 'invalid_config' ? 503 : 400 });
    return new Response(null, { status: 503 });
  }
}
