import {deliveryPickupWindowAllows} from '../settings/schedule';
import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { deliveryId } from '../settings/schema';
import { DeliverySettingsError, loadDeliverySettingsInTransaction } from '../settings/server';
import { quoteFingerprint } from './binding';
import { storedDeliveryQuoteSchema, type StoredDeliveryQuote } from './schema';

export class DeliveryQuoteStoreError extends Error {
  constructor(readonly code: 'invalid_quote' | 'quote_conflict' | 'quote_expired' | 'quote_changed' | 'quote_missing' | 'quote_unavailable', readonly status: number) { super(code); }
}
const readSchema = z.object({ brandId: deliveryId, locationId: deliveryId, quoteRef: deliveryId }).strict();
async function safe<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    if (error instanceof AuthorityError || error instanceof DeliveryQuoteStoreError) throw error;
    if (error instanceof DeliverySettingsError) throw new DeliveryQuoteStoreError('quote_unavailable', 503);
    throw new DeliveryQuoteStoreError('quote_unavailable', 503);
  }
}
function validate(input: unknown, now: number): StoredDeliveryQuote {
  const parsed = storedDeliveryQuoteSchema.safeParse(input);
  if (!parsed.success) throw new DeliveryQuoteStoreError('invalid_quote', 400);
  const quote = parsed.data;
  if (![quote.binding.brandId, quote.binding.locationId, quote.quoteRef].every(value => deliveryId.safeParse(value).success)) throw new DeliveryQuoteStoreError('invalid_quote', 400);
  if (quote.fingerprint !== quoteFingerprint(quote.binding)) throw new DeliveryQuoteStoreError('invalid_quote', 400);
  if (now < quote.createdAtMs || now >= quote.expiresAtMs) throw new DeliveryQuoteStoreError('quote_expired', 409);
  return quote;
}
async function current(tx: FirebaseFirestore.Transaction, quote: StoredDeliveryQuote) {
  const { result } = await loadDeliverySettingsInTransaction(tx, quote.binding.brandId, quote.binding.locationId);
  if(!deliveryPickupWindowAllows(result.settings,quote.fulfillment.readyAt,quote.providerQuote.pickupInterval))throw new DeliveryQuoteStoreError('quote_changed',409);
  if (result.brandRevision !== quote.binding.brandRevision || result.revision !== quote.binding.locationRevision
    || result.settings.providerId !== quote.binding.providerId || !result.settings.enabled || result.settings.paused
    || !isDeepStrictEqual(result.settings.pricingRules, (quote.economics.baseRules ?? quote.economics.rules))
    || quote.economics.route.meters > result.settings.maxDistanceMeters) throw new DeliveryQuoteStoreError('quote_changed', 409);
}
/** Trusted internal service only: provider/route/cart inputs must be resolved server-side. No public action or HTTP wrapper. */
export async function createTrustedDeliveryQuote(input: unknown): Promise<StoredDeliveryQuote> {
  const identity = await verifiedOrderflyIdentity();
  const quote = validate(input, Date.now());
  return safe(() => getAdminDb().runTransaction(async tx => {
    await authorizeTransaction(tx, identity, quote.binding, 'orderfly.catalog:view', 'location');
    await current(tx, quote);
    const ref = getAdminDb().collection('deliveryQuotes').doc(quote.quoteRef);
    if ((await tx.get(ref)).exists) throw new DeliveryQuoteStoreError('quote_conflict', 409);
    validate(quote, Date.now());
    tx.create(ref, quote);
    return quote;
  }));
}
/** Scope is authorized before fetching a quote; expiry is enforced even before background TTL cleanup. */
export async function readDeliveryQuote(input: unknown): Promise<StoredDeliveryQuote> {
  const identity = await verifiedOrderflyIdentity();
  const parsed = readSchema.safeParse(input); if (!parsed.success) throw new DeliveryQuoteStoreError('invalid_quote', 400);
  return safe(() => getAdminDb().runTransaction(async tx => {
    await authorizeTransaction(tx, identity, parsed.data, 'orderfly.catalog:view', 'location');
    const snapshot = await tx.get(getAdminDb().collection('deliveryQuotes').doc(parsed.data.quoteRef));
    if (!snapshot.exists) throw new DeliveryQuoteStoreError('quote_missing', 404);
    const raw = snapshot.data();
    if (raw?.quoteRef !== snapshot.id || raw?.binding?.brandId !== parsed.data.brandId || raw?.binding?.locationId !== parsed.data.locationId) throw new AuthorityError('forbidden');
    const quote = validate(raw, Date.now());
    await current(tx, quote);
    validate(quote, Date.now());
    return quote;
  }));
}
