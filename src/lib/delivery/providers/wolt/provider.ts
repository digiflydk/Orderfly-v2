import 'server-only';
import { createHash } from 'node:crypto';
import { deliveryQuoteRequestSchema, deliveryCreateRequestSchema, deliveryCancelRequestSchema, deliveryReconcileRequestSchema,
  type DeliveryProvider, type DeliveryQuoteRequest, type DeliveryQuoteResult, type DeliveryCreateRequest,
  type DeliveryCreateResult, type DeliveryCancelResult, type DeliveryReconcileResult, type DeliveryScope, type DeliveryMoney, type ProviderCapabilities } from '../../provider-contract';
import { resolveWoltBinding, type WoltBinding, type WoltBindingDependencies } from './binding';
import { resolveWoltConfig, type WoltEnvironment, type WoltSecretResolver } from './config';
import { createWoltHttpClient } from './http';
import { requestWoltQuote, type WoltQuoteBinding } from './quote';
import { isWoltQuoteFresh } from './schedule';
import { createWoltDelivery } from './create';
import { cancelWoltDelivery } from './cancel';

export const woltCapabilities: ProviderCapabilities = Object.freeze({ quote: true, create: true,
  readByProviderId: false, lookupByInternalReference: false, enforcedCreateIdempotency: false,
  cancellation: true, cancellationPricePreview: false, scheduledDeliveries: true, readyForPickup: false,
  trackingLinks: true, authenticatedWebhooks: true, sequenceNumbers: false });

/** Private immutable quote data, stored by the shared coordinator, never accepted from a browser. */
export interface WoltPrivateQuote {
  scope: DeliveryScope; quoteRef: string; fingerprint: string;
  bindingRevision: string; merchantId: string; venueId: string; environment: WoltEnvironment;
  cost: DeliveryMoney; native: WoltQuoteBinding;
}
export interface WoltProviderDependencies extends WoltBindingDependencies {
  environment: WoltEnvironment;
  resolveSecret: WoltSecretResolver;
  saveQuote(quote: Readonly<WoltPrivateQuote>): Promise<void>;
  loadQuote(scope: Readonly<DeliveryScope>, quoteRef: string): Promise<WoltPrivateQuote | null>;
  /** Verify durable submitting claim + order/quote/digest linkage. Shared dispatcher alone calls create once.
   * This hook must not manufacture a claim or retry dispatch; crash/replay remains unknown in shared storage. */
  validateClaimedAttempt(request: Readonly<DeliveryCreateRequest>): Promise<boolean>;
  loadCancellation(scope: Readonly<DeliveryScope>, attemptRef: string): Promise<{
    scope: DeliveryScope; providerDeliveryId: string; woltOrderReferenceId: string;
    merchantId: string; venueId: string; environment: WoltEnvironment;
    pickupStarted: boolean; pickupCompleted: boolean;
  } | null>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  quoteMaxAgeMs?: number;
}

const error = (code: string, retry: 'never' | 'read_only' | 'after_reconciliation' = 'never') => ({ code, messageKey: `delivery.wolt.${code}`, retry, nativeCode: null });
const point = (value: string | null) => value === null ? null : { earliest: value, latest: value };
const equalScope = (a: DeliveryScope, b: DeliveryScope) => a.brandId === b.brandId && a.locationId === b.locationId;
const sameMoney = (a: DeliveryMoney, b: DeliveryMoney) => a.amountMinor === b.amountMinor && a.currency === b.currency && a.taxBasis === b.taxBasis && a.taxMinor === b.taxMinor;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Input is parsed into the actual shared contract first, so omitted fields cannot change equivalence. */
export const woltFulfillmentFingerprint = (request: DeliveryQuoteRequest) => createHash('sha256').update(canonical(deliveryQuoteRequestSchema.parse(request))).digest('hex');

export function createWoltProvider(dependencies: WoltProviderDependencies): DeliveryProvider {
  // Snapshot callbacks/options, preventing caller mutation while a request is awaiting I/O.
  const deps = { ...dependencies };
  const maxAge = deps.quoteMaxAgeMs ?? 300_000;
  if (!Number.isInteger(maxAge) || maxAge < 1 || maxAge > 300_000) throw new Error('INVALID_WOLT_FRESHNESS');
  const now = deps.now ?? Date.now;
  async function context(scope: DeliveryScope) {
    const binding = await resolveWoltBinding(scope, deps, deps.environment);
    const config = await resolveWoltConfig(binding, deps.environment, deps.resolveSecret);
    return { binding, client: createWoltHttpClient(config, { fetchImpl: deps.fetchImpl }) };
  }
  function validQuote(quote: WoltPrivateQuote, request: DeliveryCreateRequest, binding: Readonly<WoltBinding>, at: number) {
    return equalScope(quote.scope, request.scope) && quote.quoteRef === request.quoteRef
      && quote.fingerprint === woltFulfillmentFingerprint(request.fulfillment)
      && quote.bindingRevision === binding.revision && quote.merchantId === binding.merchantId
      && quote.venueId === binding.venueId && quote.environment === binding.environment
      && quote.native.venueId === binding.venueId && quote.native.promiseId === quote.quoteRef
      && sameMoney(quote.cost, request.quotedCost) && isWoltQuoteFresh(quote.native, at, maxAge);
  }
  return Object.freeze({
    providerId: 'wolt', capabilities: woltCapabilities,
    async quote(raw: unknown): Promise<DeliveryQuoteResult> {
      const parsed = deliveryQuoteRequestSchema.safeParse(raw);
      if (!parsed.success || parsed.data.providerId !== 'wolt') return { kind: 'error', error: error('invalid_request') };
      const request = parsed.data;
      if (request.requirements.length) return { kind: 'unavailable', reason: 'unsupported_requirements' };
      if (!/^\+[1-9]\d{6,14}$/.test(request.dropoffContact.phone) || request.items.some(item => item.quantity > 100)
        || [request.dropoff.unit, request.instructions].filter(Boolean).join('\n').length > 500) return { kind: 'error', error: error('invalid_request') };
      if (request.desiredDelivery.kind === 'scheduled' && Date.parse(request.desiredDelivery.interval.earliest) !== Date.parse(request.desiredDelivery.interval.latest)) return { kind: 'unavailable', reason: 'unsupported_schedule' };
      try {
        const { binding, client } = await context(request.scope);
        const at = now();
        const preparationMinutes = Math.max(0, Math.ceil((Date.parse(request.readyAt) - at) / 60_000));
        const result = await requestWoltQuote(client, { venueId: binding.venueId,
          address: { street: request.dropoff.street, building: request.dropoff.building, city: request.dropoff.city, postCode: request.dropoff.postcode,
            coordinates: { lat: request.dropoff.coordinates.latitude, lon: request.dropoff.coordinates.longitude } },
          preparationMinutes, ...(request.desiredDelivery.kind === 'scheduled' ? { scheduledDropoffTime: request.desiredDelivery.interval.earliest } : {}),
          parcels: request.items.map(item => ({ count: item.quantity })),
        }, at);
        if (result.status === 'error') return { kind: 'error', error: { ...error(result.error.code, result.error.retryClass), nativeCode: result.error.nativeCode ?? null } };
        if (result.status === 'unavailable') {
          const reason = result.reason === 'unsupported_schedule' ? 'unsupported_schedule' : /OUTSIDE.*AREA|DELIVERY_NOT_ENABLED/.test(result.reason) ? 'outside_area' : /CLOSED|HOURS/.test(result.reason) ? 'closed' : result.reason === 'nonbinding_quote' ? 'invalid_address' : null;
          return reason ? { kind: 'unavailable', reason } : { kind: 'error', error: error('quote_unavailable') };
        }
        const cost: DeliveryMoney = { amountMinor: result.cost.amount, currency: result.cost.currency, taxBasis: 'inclusive', taxMinor: null };
        const privateQuote: WoltPrivateQuote = { scope: { ...request.scope }, quoteRef: result.quoteReference,
          fingerprint: woltFulfillmentFingerprint(request), bindingRevision: binding.revision, merchantId: binding.merchantId,
          venueId: binding.venueId, environment: binding.environment, cost, native: result.native };
        await deps.saveQuote(structuredClone(privateQuote));
        return { kind: 'available', providerId: 'wolt', quoteRef: result.quoteReference, cost, surcharges: [], expiresAt: result.expiresAt,
          pickupEstimateProvenance: { source: 'wolt.shipment_promise', reliability: 'preliminary', observedAt: new Date(at).toISOString() },
          pickupInterval: result.pickupEstimate, deliveryInterval: result.deliveryEstimate, distance: null, capabilities: woltCapabilities };
      } catch { return { kind: 'error', error: error('configuration_or_storage_unavailable') }; }
    },
    async create(raw: unknown): Promise<DeliveryCreateResult> {
      const parsed = deliveryCreateRequestSchema.safeParse(raw);
      if (!parsed.success || parsed.data.providerId !== 'wolt') return { kind: 'rejected', error: error('invalid_request') };
      const request = parsed.data;
      try {
        const { binding, client } = await context(request.scope);
        const stored = await deps.loadQuote(request.scope, request.quoteRef);
        const quote = stored ? structuredClone(stored) : null;
        if (!quote || !validQuote(quote, request, binding, now())) return { kind: 'rejected', error: error('quote_changed_or_expired') };
        if (await deps.validateClaimedAttempt(structuredClone(request)) !== true) return { kind: 'unknown', attemptRef: request.attemptRef, error: error('dispatch_claim_unverified', 'after_reconciliation') };
        // Recheck after claim verification: that I/O can outlive the quote's validity.
        if (!validQuote(quote, request, binding, now())) return { kind: 'rejected', error: error('quote_changed_or_expired') };
        const result = await createWoltDelivery({ scope: request.scope, binding: { ...request.scope, venueId: binding.venueId },
          quote: { ...request.scope, venueId: quote.venueId, promiseId: quote.native.promiseId, validUntil: quote.native.validUntil,
            fetchedAt: quote.native.fetchedAt, isBinding: true, dropoff: quote.native.dropoff, scheduledDropoffTime: quote.native.scheduledDropoffTime },
          merchantOrderReferenceId: request.attemptRef, recipient: { name: request.fulfillment.dropoffContact.name, phoneNumber: request.fulfillment.dropoffContact.phone },
          parcels: request.fulfillment.items.map((item, index) => ({ count: item.quantity, description: item.name, identifier: `${request.orderRef.slice(0, 180)}-${index}` })),
          dropoffComment: [request.fulfillment.dropoff.unit, request.fulfillment.instructions].filter(Boolean).join('\n'),
          ...(request.fulfillment.bagCount === null ? {} : { bagCount: request.fulfillment.bagCount }),
        }, value => client.request(value), new Date(now()));
        if (result.kind === 'rejected') return { kind: 'rejected', error: error(result.code) };
        if (result.kind === 'unknown') return { kind: 'unknown', attemptRef: request.attemptRef, error: error(result.code, 'after_reconciliation') };
        return { kind: 'accepted', providerDeliveryId: result.providerDeliveryId, nativeReference: result.woltOrderReferenceId,
          pickupEstimateProvenance: { source: 'wolt.create', reliability: 'preliminary', observedAt: new Date(now()).toISOString() },
          trackingUrl: result.trackingUrl, pickupInterval: point(result.pickupEta), deliveryInterval: point(result.dropoffEta),
          cost: result.providerCost ? { amountMinor: result.providerCost.amount, currency: result.providerCost.currency, taxBasis: result.providerCost.taxBasis, taxMinor: null } : null };
      } catch { return { kind: 'unknown', attemptRef: request.attemptRef, error: error('create_outcome_unverified', 'after_reconciliation') }; }
    },
    async cancel(raw: unknown): Promise<DeliveryCancelResult> {
      const parsed = deliveryCancelRequestSchema.safeParse(raw);
      if (!parsed.success) return { kind: 'unknown', error: error('invalid_request') };
      const request = parsed.data;
      if (request.acceptedFee !== null) return { kind: 'unsupported' };
      try {
        const { binding, client } = await context(request.scope);
        const value = await deps.loadCancellation(request.scope, request.attemptRef);
        const saved = value ? structuredClone(value) : null;
        if (!saved || !equalScope(saved.scope, request.scope) || saved.providerDeliveryId !== request.providerDeliveryId
          || saved.merchantId !== binding.merchantId || saved.venueId !== binding.venueId || saved.environment !== binding.environment) return { kind: 'unknown', error: error('delivery_binding_unverified') };
        const result = await cancelWoltDelivery({ scope: request.scope, delivery: { ...request.scope,
          woltOrderReferenceId: saved.woltOrderReferenceId, pickupStarted: saved.pickupStarted, pickupCompleted: saved.pickupCompleted }, reason: request.operatorReason }, value => client.request(value));
        if (result.kind === 'cancelled') return { kind: 'cancelled', fee: null };
        return { kind: result.kind, error: error(result.code, result.kind === 'unknown' ? 'after_reconciliation' : 'never') };
      } catch { return { kind: 'unknown', error: error('cancel_outcome_unverified', 'after_reconciliation') }; }
    },
    async reconcile(raw: unknown): Promise<DeliveryReconcileResult> {
      const parsed = deliveryReconcileRequestSchema.safeParse(raw);
      if (!parsed.success) return { kind: 'unknown', error: error('invalid_request') };
      try { await resolveWoltBinding(parsed.data.scope, deps, deps.environment); }
      catch { return { kind: 'unknown', error: error('binding_unverified') }; }
      return { kind: 'unsupported' };
    },
  });
}
