import 'server-only';
import { z } from 'zod';
import { worldlineTransactionSchema } from './worldline-verification';
import { worldlineCredentialsSchema, validateWorldlineCredentials, type WorldlineCredentials } from './worldline-settings';

/** Uncertain writes must be reconciled, never retried as a new payment. */
export class WorldlineRequestError extends Error {
  constructor(public readonly outcome: 'rejected' | 'unknown', public readonly code = outcome === 'unknown' ? 'WORLDLINE_REQUEST_UNKNOWN' : 'WORLDLINE_REQUEST_REJECTED') {
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
  amountMinor: z.number().int().positive().max(2147483647),
  currency: z.string().regex(/^[A-Z]{3}$/),
  acceptUrl: returnUrl, cancelUrl: returnUrl, callbackUrl: returnUrl,
}).strict();
export type WorldlineSessionInput = z.infer<typeof sessionInput>;
const sessionResponse = z.object({
  meta: z.object({ result: z.literal(true) }),
  token: z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/),
  url: z.string().url(),
});
function checkoutProviderCode(body: unknown): string | undefined {
  const parsed = z.object({ meta: z.object({ action: z.object({ code: z.string() }) }) }).safeParse(body);
  const code = parsed.success ? parsed.data.meta.action.code : undefined;
  // BEC codes include five-digit values (e.g. 40005). Never carry messages,
  // arbitrary strings, line breaks, or unbounded numeric data into diagnostics.
  return code && code.length <= 6 && !/[^0-9]/.test(code) ? code : undefined;
}

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
        instantcaptureamount: 0,
        url: { accept: value.acceptUrl, cancel: value.cancelUrl, callbacks: [{ url: value.callbackUrl }] },
        paymentwindow: { language: 'da-DK' },
      }),
    });
  } catch {
    // Do not include fetch errors: upstream errors can contain credentials/URLs.
    throw new WorldlineRequestError('unknown', 'WORLDLINE_CHECKOUT_UNKNOWN');
  }
  if (!response.ok) {
    const outcome = response.status >= 400 && response.status < 500 && response.status !== 408 ? 'rejected' : 'unknown';
    let providerCode: string | undefined;
    try { providerCode = checkoutProviderCode(await response.json()); }
    catch { /* Optional diagnostics never change the known HTTP outcome. */ }
    // The HTTP status is a bounded number, never an upstream message or body.
    const code = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599
      ? `WORLDLINE_CHECKOUT_HTTP_${response.status}${providerCode ? `_PROVIDER_${providerCode}` : ''}` : 'WORLDLINE_CHECKOUT_UNKNOWN';
    throw new WorldlineRequestError(outcome, code);
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new WorldlineRequestError('unknown', 'WORLDLINE_CHECKOUT_UNKNOWN'); }
  const declined = z.object({ meta: z.object({ result: z.literal(false) }) }).safeParse(body);
  if (declined.success) {
    const providerCode = checkoutProviderCode(body);
    throw new WorldlineRequestError('rejected', providerCode
      ? `WORLDLINE_CHECKOUT_PROVIDER_${providerCode}` : 'WORLDLINE_CHECKOUT_REJECTED');
  }
  const parsed = sessionResponse.safeParse(body);
  if (!parsed.success) throw new WorldlineRequestError('unknown', 'WORLDLINE_CHECKOUT_UNKNOWN');
  const url = new URL(parsed.data.url);
  if (url.origin !== 'https://v1.checkout.bambora.com' || url.username || url.password || url.pathname !== `/${parsed.data.token}`) throw new WorldlineRequestError('unknown', 'WORLDLINE_CHECKOUT_UNKNOWN');
  return { token: parsed.data.token, url: url.href };
}

/** Returns a verified provider observation, not permission to settle an order. */
export async function readWorldlineTransaction(credentials: WorldlineCredentials, mode: 'test' | 'live', transactionId: string) {
  const keys = worldlineCredentialsSchema.parse(credentials);
  validateWorldlineCredentials(keys, mode);
  if (!/^[0-9]{1,32}$/.test(transactionId)) throw new Error('Ugyldigt transaktionsnummer.');
  let body: unknown;
  try {
    const response = await fetch(`https://merchant-v1.api-eu.bambora.com/transactions/${transactionId}`, {
      method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Basic ${Buffer.from(`${keys.accessToken}@${keys.merchantNumber}:${keys.secretToken}`).toString('base64')}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Provider unavailable');
    body = await response.json();
  } catch { throw new WorldlineRequestError('unknown'); }
  const parsed = z.object({ meta: z.object({ result: z.literal(true) }), transaction: worldlineTransactionSchema }).safeParse(body);
  if (!parsed.success || parsed.data.transaction.id !== transactionId || parsed.data.transaction.merchantnumber !== keys.merchantNumber) throw new WorldlineRequestError('unknown');
  return parsed.data.transaction;
}

/** Europe Transaction API. Deliberately no network retry: a lost reply may have moved money. */
export async function mutateWorldlineTransaction(credentials: WorldlineCredentials, mode: 'test' | 'live',
  transactionId: string, operation: 'capture' | 'credit' | 'delete', amountMinor?: number) {
  const keys = worldlineCredentialsSchema.parse(credentials);
  validateWorldlineCredentials(keys, mode);
  if (!/^[0-9]{1,32}$/.test(transactionId) || !['capture', 'credit', 'delete'].includes(operation)
    || (operation !== 'delete' && (!Number.isSafeInteger(amountMinor) || amountMinor! <= 0 || amountMinor! > 2147483647))
    || (operation === 'delete' && amountMinor !== undefined)) throw new Error('Ugyldig betalingsoperation.');
  let response: Response;
  try {
    response = await fetch(`https://transaction-v1.api-eu.bambora.com/transactions/${transactionId}/${operation}`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Basic ${Buffer.from(`${keys.accessToken}@${keys.merchantNumber}:${keys.secretToken}`).toString('base64')}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(operation === 'delete' ? { deletetype: 'instant' } : { amount: amountMinor, currency: 'DKK' }),
    });
  } catch { throw new WorldlineRequestError('unknown'); }
  // A proxy's HTTP status alone is not proof that no money moved.
  let body: unknown;
  try { body = await response.json(); } catch { throw new WorldlineRequestError('unknown'); }
  if (!response.ok) throw new WorldlineRequestError('unknown');
  const meta = z.object({ meta: z.object({ result: z.boolean() }) }).safeParse(body);
  if (!meta.success) throw new WorldlineRequestError('unknown');
  if (!meta.data.meta.result) throw new WorldlineRequestError('rejected');
}
