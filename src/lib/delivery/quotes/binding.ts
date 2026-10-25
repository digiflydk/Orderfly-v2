import { createHash } from 'node:crypto';
import { storedDeliveryQuoteSchema, type StoredDeliveryQuote } from './schema';
import { quoteContentDigest } from './digest';
import { type DeliveryQuoteRequest, type DeliveryQuoteResult } from '../provider-contract';
import { calculateDeliveryPrice, isRouteDistance, type DeliveryPriceInput } from '../pricing/calculate';

/** Internal helper: input must originate from authoritative scoped checkout data. */
export type QuoteBindingInput = {
  brandId: string; locationId: string; checkoutReference: string; providerId: string;
  normalizedAddress: string; cartDigest: string; fulfillmentAt: string;
  brandRevision: number; locationRevision: number;
};
const safeId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const revision = (v: number) => Number.isSafeInteger(v) && v >= 0;
export function quoteFingerprint(input: QuoteBindingInput): string {
  if (!input || ![input.brandId,input.locationId,input.checkoutReference,input.providerId].every(safeId)
    || typeof input.normalizedAddress !== 'string' || !input.normalizedAddress.trim() || input.normalizedAddress.length > 1000
    || !/^[a-f0-9]{64}$/.test(input.cartDigest) || !revision(input.brandRevision) || !revision(input.locationRevision)
    || !isRouteDistance({meters:0,method:'route',source:'validation',profile:'validation',calculatedAt:input.fulfillmentAt})) throw new Error('invalid_quote_binding');
  return createHash('sha256').update(JSON.stringify([1,input.brandId,input.locationId,input.checkoutReference,input.providerId,
    input.normalizedAddress,input.cartDigest,input.fulfillmentAt,input.brandRevision,input.locationRevision])).digest('hex');
}
export function buildQuote(input: { binding: QuoteBindingInput; quoteRef: string; providerQuoteRef: string;
  fulfillment: DeliveryQuoteRequest; providerQuote: Extract<DeliveryQuoteResult,{kind:'available'}>;
  nowMs: number; freshnessMs: number; providerExpiresAtMs: number | null; price: DeliveryPriceInput }) {
  if (!safeId(input.quoteRef) || typeof input.providerQuoteRef !== 'string' || !input.providerQuoteRef.trim() || input.providerQuoteRef.length > 500
    || !Number.isSafeInteger(input.nowMs) || input.nowMs < 0 || !Number.isSafeInteger(input.freshnessMs) || input.freshnessMs <= 0 || input.freshnessMs > 300000
    || (input.providerExpiresAtMs !== null && (!Number.isSafeInteger(input.providerExpiresAtMs) || input.providerExpiresAtMs <= input.nowMs))) throw new Error('invalid_quote_expiry');
  const fingerprint = quoteFingerprint(input.binding);
  const nativeExpiry=input.providerQuote.expiresAt===null?null:Date.parse(input.providerQuote.expiresAt);
  if(nativeExpiry!==input.providerExpiresAtMs)throw new Error('provider_expiry_mismatch');
  const expiresAtMs = Math.min(input.nowMs + input.freshnessMs, nativeExpiry ?? Infinity);
  if (!Number.isSafeInteger(expiresAtMs)) throw new Error('invalid_quote_expiry');
  const result = calculateDeliveryPrice(input.price);
  if (!result.ok) return result;
  const envelope={ version: 1 as const, quoteRef: input.quoteRef, providerQuoteRef: input.providerQuoteRef,
    binding: structuredClone(input.binding), fingerprint, createdAtMs: input.nowMs, expiresAtMs, economics: result.snapshot, fulfillment:structuredClone(input.fulfillment), providerQuote:structuredClone(input.providerQuote) };
  const quote=storedDeliveryQuoteSchema.parse({...envelope,contentDigest:quoteContentDigest(envelope)});
  return {ok:true as const,quote};
}
export type BoundQuote = StoredDeliveryQuote;
export function validateQuoteAcceptance(quote: BoundQuote, binding: QuoteBindingInput, nowMs: number, acceptedFeeMinor: number):
  'valid' | 'expired' | 'changed' | 'price_acceptance_required' {
  if (!storedDeliveryQuoteSchema.safeParse(quote).success) return 'changed';
  if (!quote || !Number.isSafeInteger(quote.createdAtMs) || !Number.isSafeInteger(quote.expiresAtMs) || quote.expiresAtMs <= quote.createdAtMs || quote.fingerprint !== quoteFingerprint(quote.binding)) return 'changed';
  if (!Number.isSafeInteger(nowMs) || nowMs < quote.createdAtMs || nowMs >= quote.expiresAtMs) return 'expired';
  if (quote.fingerprint !== quoteFingerprint(binding)) return 'changed';
  if (!Number.isSafeInteger(acceptedFeeMinor) || acceptedFeeMinor !== quote.economics.customerFee.amountMinor) return 'price_acceptance_required';
  return 'valid';
}
