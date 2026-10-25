import { createHash } from 'node:crypto';
import { deliveryQuoteRequestSchema, deliveryCreateRequestSchema, deliveryReconcileRequestSchema, deliveryCancelRequestSchema,
  deliveryMoneySchema, type DeliveryProvider, type DeliveryQuoteRequest, type DeliveryQuoteResult, type DeliveryCreateRequest,
  type DeliveryCreateResult, type DeliveryReconcileResult, type DeliveryCancelResult, type DeliveryMoney } from '../../provider-contract';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = (code: string, retry: 'never' | 'read_only' | 'after_reconciliation' = 'never') => ({ code, messageKey: `delivery.${code}`, retry, nativeCode: null });
/** In-memory deterministic simulation. Registration must mark testOnly, never production. */
export class DeterministicDeliveryTestProvider implements DeliveryProvider {
  readonly providerId = 'test';
  readonly capabilities = Object.freeze({ quote: true as const, create: true as const, readByProviderId: true, lookupByInternalReference: true,
    enforcedCreateIdempotency: true, cancellation: true, cancellationPricePreview: false, scheduledDeliveries: true,
    readyForPickup: false, trackingLinks: false, authenticatedWebhooks: false, sequenceNumbers: true });
  private readonly records = new Map<string, { fingerprint: string; request: DeliveryCreateRequest; result: Extract<DeliveryCreateResult, {kind:'accepted'}>; cancelled: boolean }>();
  private readonly quotes = new Map<string, { scope: DeliveryQuoteRequest['scope']; fingerprint: string; expiresAt: number }>();
  private readonly rejections = new Map<string, {fingerprint: string; result: Extract<DeliveryCreateResult,{kind:'rejected'}>}>();
  private readonly cost: DeliveryMoney;
  constructor(private readonly options: { environment: 'test'; cost: DeliveryMoney; now: () => number; mode?: 'success' | 'reject' | 'lost_response'; unavailable?: boolean }) {
    if (options.environment !== 'test' || process.env.NODE_ENV === 'production') throw new Error('delivery_test_provider_forbidden');
    this.cost = deliveryMoneySchema.parse(options.cost);
  }
  async quote(raw: DeliveryQuoteRequest): Promise<DeliveryQuoteResult> {
    const request = deliveryQuoteRequestSchema.parse(raw);
    if (request.providerId !== this.providerId) throw new Error('delivery_test_provider_scope');
    if (this.options.unavailable) return { kind: 'unavailable', reason: 'outside_area' };
    const expiresAt = this.options.now() + 60_000, quoteRef = hash([request, expiresAt]);
    this.quotes.set(quoteRef, { scope: request.scope, fingerprint: hash(request), expiresAt });
    return { kind: 'available', providerId: this.providerId, quoteRef, cost: {...this.cost}, surcharges: [], expiresAt: new Date(expiresAt).toISOString(),
      pickupInterval: null, pickupEstimateProvenance: null, deliveryInterval: null, distance: null, capabilities: this.capabilities };
  }
  async create(raw: DeliveryCreateRequest): Promise<DeliveryCreateResult> {
    const request = deliveryCreateRequestSchema.parse(raw), key = hash([request.scope, request.attemptRef]), fingerprint = hash(request), old = this.records.get(key);
    if (request.providerId !== this.providerId) throw new Error('delivery_test_provider_scope');
    if (old) {
      if (old.fingerprint !== fingerprint) return { kind: 'rejected', error: error('idempotency_conflict') };
      return structuredClone(old.result);
    }
    const rejected = this.rejections.get(key);
    if (rejected) return rejected.fingerprint === fingerprint ? structuredClone(rejected.result) : {kind:'rejected',error:error('idempotency_conflict')};
    const reject = (code: string): DeliveryCreateResult => { const result = {kind:'rejected' as const,error:error(code)};this.rejections.set(key,{fingerprint,result});return result; };
    const quote = this.quotes.get(request.quoteRef);
    if (!quote || quote.expiresAt <= this.options.now() || quote.fingerprint !== hash(request.fulfillment)
      || hash(quote.scope) !== hash(request.scope) || hash(request.quotedCost) !== hash(this.cost)) return reject('quote_invalid');
    if (this.options.mode === 'reject') return reject('provider_rejected');
    const result: Extract<DeliveryCreateResult,{kind:'accepted'}> = { kind: 'accepted', providerDeliveryId: `test_${key}`, nativeReference: request.attemptRef,
      trackingUrl: null, pickupInterval: null, pickupEstimateProvenance: null, deliveryInterval: null, cost: {...this.cost} };
    this.records.set(key, { fingerprint, request: structuredClone(request), result, cancelled: false });
    return this.options.mode === 'lost_response' ? { kind: 'unknown', attemptRef: request.attemptRef, error: error('transport_unknown','after_reconciliation') } : structuredClone(result);
  }
  async reconcile(raw: Parameters<DeliveryProvider['reconcile']>[0]): Promise<DeliveryReconcileResult> {
    const request = deliveryReconcileRequestSchema.parse(raw), record = this.records.get(hash([request.scope, request.attemptRef]));
    if (!record || request.providerDeliveryId !== null && request.providerDeliveryId !== record.result.providerDeliveryId) return { kind: 'unknown', error: error('not_found','read_only') };
    // The create outcome remains known even if a later cancellation exists.
    return { kind: 'found', delivery: structuredClone(record.result) };
  }
  async cancel(raw: Parameters<DeliveryProvider['cancel']>[0]): Promise<DeliveryCancelResult> {
    const request = deliveryCancelRequestSchema.parse(raw), record = this.records.get(hash([request.scope, request.attemptRef]));
    if (!record || record.result.providerDeliveryId !== request.providerDeliveryId) return { kind: 'not_cancellable', error: error('not_found') };
    record.cancelled = true;
    return { kind: 'cancelled', fee: { ...this.cost, amountMinor: 0, taxMinor: 0 } };
  }
}
