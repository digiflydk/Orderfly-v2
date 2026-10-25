import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const WOLT_WEBHOOK_MAX_BYTES = 64 * 1024;
const id = z.string().min(1).max(256);
const instant = z.string().datetime({ offset: true });
const nullableInstant = instant.nullish();
const details = z.object({
  id,
  venue_id: id.optional(),
  wolt_order_reference_id: id,
  merchant_order_reference_id: id.nullish(),
  pickup: z.object({ eta: nullableInstant }).nullish(),
  dropoff: z.object({
    eta: z.object({ min: instant, max: instant }).refine(v => Date.parse(v.min) <= Date.parse(v.max)).nullish(),
    completed_at: nullableInstant,
  }).nullish(),
  purchase_rejected_reason: z.string().max(256).nullish(),
  not_delivered_details: z.object({
    outcome: z.string().max(256), reason: z.string().max(256), recorded_at: instant,
  }).nullish(),
});
const payload = z.object({
  dispatched_at: instant,
  type: z.string().regex(/^order\.[a-z_]+$/).max(100),
  details,
  exp: z.number().finite().optional(),
  nbf: z.number().finite().optional(),
});
export type VerifiedWoltPayload = z.infer<typeof payload>;
export class WoltWebhookError extends Error {
  constructor(public readonly code: 'invalid_payload' | 'invalid_signature' | 'invalid_config' | 'payload_too_large') {
    super(code); this.name = 'WoltWebhookError';
  }
}
function decode(segment: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new WoltWebhookError('invalid_payload');
  const bytes = Buffer.from(segment, 'base64url');
  if (bytes.toString('base64url') !== segment) throw new WoltWebhookError('invalid_payload');
  return bytes;
}
/** Select this secret using a server-owned merchant callback binding, never unverified JWT fields. */
export function verifyWoltWebhook(body: Uint8Array, secret: string, nowMs = Date.now()): VerifiedWoltPayload {
  if (body.byteLength > WOLT_WEBHOOK_MAX_BYTES) throw new WoltWebhookError('payload_too_large');
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 16 || !Number.isFinite(nowMs)) {
    throw new WoltWebhookError('invalid_config');
  }
  try {
    const envelope = z.object({ token: z.string().min(1).max(WOLT_WEBHOOK_MAX_BYTES) }).parse(JSON.parse(Buffer.from(body).toString('utf8')));
    const segments = envelope.token.split('.');
    if (segments.length !== 3) throw new WoltWebhookError('invalid_payload');
    const [headerPart, payloadPart, signaturePart] = segments;
    const header = z.object({ alg: z.literal('HS256'), typ: z.literal('JWT').optional() }).strict().parse(JSON.parse(decode(headerPart).toString('utf8')));
    if (header.alg !== 'HS256') throw new WoltWebhookError('invalid_signature');
    const signature = decode(signaturePart);
    const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new WoltWebhookError('invalid_signature');
    const event = payload.parse(JSON.parse(decode(payloadPart).toString('utf8')));
    const nowSeconds = nowMs / 1000;
    if ((event.exp !== undefined && nowSeconds >= event.exp) || (event.nbf !== undefined && nowSeconds < event.nbf)) throw new WoltWebhookError('invalid_signature');
    return event;
  } catch (error) {
    if (error instanceof WoltWebhookError) throw error;
    throw new WoltWebhookError('invalid_payload');
  }
}
