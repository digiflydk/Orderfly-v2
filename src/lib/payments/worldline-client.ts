import 'server-only';
import { z } from 'zod';
import { worldlineCredentialsSchema, validateWorldlineCredentials, type WorldlineCredentials } from './worldline-settings';

/** Uncertain writes must be reconciled, never retried as a new payment. */
export class WorldlineRequestError extends Error {
  constructor(public readonly outcome: 'rejected' | 'unknown') {
    super(outcome === 'unknown' ? 'Worldline-resultatet kunne ikke bekræftes.' : 'Worldline afviste anmodningen.');
    this.name = 'WorldlineRequestError';
  }
}
const returnUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
});
const sessionInput = z.object({
  orderId: z.string().regex(/^[A-Za-z0-9_-]{1,50}$/),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/),
  acceptUrl: returnUrl, cancelUrl: returnUrl, callbackUrl: returnUrl,
}).strict();
export type WorldlineSessionInput = z.infer<typeof sessionInput>;
const sessionResponse = z.object({
  meta: z.object({ result: z.literal(true) }),
  token: z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/),
  url: z.string().url(),
});

/** Server-side hosted checkout. No card details enter Orderfly. */
export async function createWorldlineCheckoutSession(
  credentials: WorldlineCredentials,
  mode: 'test' | 'live',
  input: WorldlineSessionInput,
) {
  const keys = worldlineCredentialsSchema.parse(credentials);
  validateWorldlineCredentials(keys, mode);
  const value = sessionInput.parse(input);
  let response: Response;
  try {
    response = await fetch('https://api.v1.checkout.bambora.com/sessions', {
      method: 'POST', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${keys.accessToken}@${keys.merchantNumber}:${keys.secretToken}`).toString('base64')}`,
        'Content-Type': 'application/json', Accept: 'application/json',
      },
      body: JSON.stringify({
        order: { id: value.orderId, amount: value.amountMinor, currency: value.currency },
        url: { accept: value.acceptUrl, cancel: value.cancelUrl, callbacks: [{ url: value.callbackUrl }] },
        paymentwindow: { language: 'da-DK' },
      }),
    });
  } catch {
    // Do not include fetch errors: upstream errors can contain credentials/URLs.
    throw new WorldlineRequestError('unknown');
  }
  if (!response.ok) throw new WorldlineRequestError(response.status >= 400 && response.status < 500 && response.status !== 408 ? 'rejected' : 'unknown');
  let body: unknown;
  try { body = await response.json(); } catch { throw new WorldlineRequestError('unknown'); }
  if (z.object({ meta: z.object({ result: z.literal(false) }) }).safeParse(body).success) throw new WorldlineRequestError('rejected');
  const parsed = sessionResponse.safeParse(body);
  if (!parsed.success) throw new WorldlineRequestError('unknown');
  const url = new URL(parsed.data.url);
  if (url.origin !== 'https://v1.checkout.bambora.com' || url.username || url.password || url.pathname !== `/${parsed.data.token}`) throw new WorldlineRequestError('unknown');
  return { token: parsed.data.token, url: url.href };
}

const transactionSchema = z.object({
  id: z.string(), orderid: z.string(), merchantnumber: z.string(), status: z.string(),
  currency: z.object({ code: z.string(), minorunits: z.number().int() }),
  total: z.object({ authorized: z.number().int().nonnegative(), captured: z.number().int().nonnegative(), credited: z.number().int().nonnegative() }),
});
/** Returns a verified provider observation, not permission to settle an order. */
export async function readWorldlineTransaction(credentials: WorldlineCredentials, mode: 'test' | 'live', transactionId: string) {
  const keys = worldlineCredentialsSchema.parse(credentials);
  validateWorldlineCredentials(keys, mode);
  if (!/^[0-9]{1,32}$/.test(transactionId)) throw new Error('Ugyldigt transaktionsnummer.');
  let body: unknown;
  try {
    const response = await fetch(`https://merchant-v1.api-eu.bambora.com/transactions/${transactionId}`, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Basic ${Buffer.from(`${keys.accessToken}@${keys.merchantNumber}:${keys.secretToken}`).toString('base64')}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Provider unavailable');
    body = await response.json();
  } catch { throw new WorldlineRequestError('unknown'); }
  const parsed = z.object({ meta: z.object({ result: z.literal(true) }), transaction: transactionSchema }).safeParse(body);
  if (!parsed.success || parsed.data.transaction.id !== transactionId || parsed.data.transaction.merchantnumber !== keys.merchantNumber) throw new WorldlineRequestError('unknown');
  return parsed.data.transaction;
}
