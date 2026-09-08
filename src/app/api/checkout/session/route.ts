import { checkoutRequestSchema } from '@/lib/checkout-schema';
import { runCheckoutAttempt } from '@/lib/checkout-attempt';
import { createStripeCheckoutSessionAction } from '@/app/checkout/actions';
import { getOrigin } from '@/lib/url';

export const runtime = 'nodejs';

const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function POST(request: Request) {
  // Retain the same-origin boundary provided by Next Server Actions. Do not
  // accept form posts or allow cross-origin checkout creation.
  if (request.headers.get('origin') !== await getOrigin()
      || request.headers.get('sec-fetch-site') === 'cross-site'
      || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return reply({ success: false, retryable: true, error: 'Payment request rejected. Please reload checkout.' }, 403);
  }
  const key = request.headers.get('idempotency-key');
  if (!key || !/^[a-f0-9]{64}$/.test(key)) return reply({ success: false, retryable: true, error: 'Invalid payment attempt. Please retry.' }, 400);
  const parsed = checkoutRequestSchema.safeParse(await readBody(request).catch(() => null));
  if (!parsed.success) return reply({ success: false, retryable: true, error: 'Please check your basket and customer information.' }, 400);
  try {
    const result = await runCheckoutAttempt(key, parsed.data, () => createStripeCheckoutSessionAction(...parsed.data));
    return reply(result, result.pending ? 202 : 200);
  } catch {
    // An exception outside the action's recovery boundary may follow a write.
    // The client must not automatically retry an unknown payment outcome.
    return reply({ success: false, retryable: false, error: 'Payment status could not be confirmed. Please contact the restaurant.' }, 503);
  }
}
