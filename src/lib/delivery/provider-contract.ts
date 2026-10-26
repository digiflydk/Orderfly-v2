import { z } from 'zod';

// Transport validation is not authorization. Scope/binding must be resolved server-side.
export const deliveryIdSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
const nativeReference = z.string().min(1).max(300).regex(/^[^\u0000-\u001f\u007f]+$/);
const instant = z.string().datetime({ offset: true }).refine(v => Number.isFinite(Date.parse(v)));
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = (max: number) => z.string().trim().min(1).max(max);
export const deliveryScopeSchema = z.object({ brandId: deliveryIdSchema, locationId: deliveryIdSchema }).strict();
export const deliveryMoneySchema = z.object({
  amountMinor: integer, currency: z.string().regex(/^[A-Z]{3}$/),
  taxBasis: z.enum(['inclusive', 'exclusive', 'unknown']), taxMinor: integer.nullable(),
}).strict().refine(v => v.taxBasis !== 'inclusive' || v.taxMinor === null || v.taxMinor <= v.amountMinor, 'Tax exceeds inclusive amount');
export const routeDistanceSchema = z.object({ meters: integer, method: z.enum(['route', 'straight_line']), source: text(100), profile: text(100), calculatedAt: instant }).strict();
export const deliveryIntervalSchema = z.object({ earliest: instant, latest: instant }).strict().refine(v => Date.parse(v.earliest) <= Date.parse(v.latest), 'Reversed interval');
export const deliveryAddressSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/), postcode: text(30), city: text(120), street: text(200), building: text(60), unit: text(60).nullable(),
  coordinates: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), source: text(100) }).strict(),
}).strict();
const contact = z.object({ name: text(120), phone: text(40) }).strict();
export const providerCapabilitiesSchema = z.object({
  quote: z.literal(true), create: z.literal(true), readByProviderId: z.boolean(), lookupByInternalReference: z.boolean(),
  enforcedCreateIdempotency: z.boolean(), cancellation: z.boolean(), cancellationPricePreview: z.boolean(), scheduledDeliveries: z.boolean(),
  readyForPickup: z.boolean(), trackingLinks: z.boolean(), authenticatedWebhooks: z.boolean(), sequenceNumbers: z.boolean(),
}).strict();
const error = z.object({ code: text(80), messageKey: text(120), retry: z.enum(['never', 'read_only', 'after_reconciliation']), nativeCode: text(100).nullable() }).strict();
const tracking = z.string().url().max(2048).refine(v => { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; }, 'HTTPS tracking URL required').nullable();
export const pickupEstimateProvenanceSchema=z.object({source:text(100),reliability:z.enum(['preliminary','verified_update']),observedAt:instant}).strict();
export const deliveryQuoteRequestSchema = z.object({
  version: z.literal(1), scope: deliveryScopeSchema, checkoutRef: deliveryIdSchema, providerId: deliveryIdSchema,
  pickup: deliveryAddressSchema, dropoff: deliveryAddressSchema, pickupContact: contact, dropoffContact: contact,
  instructions: z.string().max(1000), readyAt: instant,
  preparationMinutes: z.number().int().min(0).max(240).optional(),
  desiredDelivery: z.discriminatedUnion('kind', [z.object({kind:z.literal('asap')}).strict(), z.object({kind:z.literal('scheduled'), interval:deliveryIntervalSchema}).strict()]),
  items: z.array(z.object({ name: text(150), quantity: z.number().int().min(1).max(1000) }).strict()).min(1).max(100),
  bagCount: z.number().int().min(1).max(100).nullable(), requirements: z.array(text(100)).max(20),
}).strict();
export const deliveryQuoteResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('available'), providerId: deliveryIdSchema, quoteRef: nativeReference, cost: deliveryMoneySchema,
    surcharges: z.array(z.object({ code:text(80), amount:deliveryMoneySchema }).strict()).max(20), expiresAt: instant.nullable(),
    pickupEstimateProvenance:pickupEstimateProvenanceSchema.nullable(), pickupInterval: deliveryIntervalSchema.nullable(), deliveryInterval: deliveryIntervalSchema.nullable(), distance: routeDistanceSchema.nullable(), capabilities: providerCapabilitiesSchema }).strict(),
  z.object({ kind:z.literal('unavailable'), reason:z.enum(['outside_area','closed','unsupported_schedule','unsupported_requirements','capacity','invalid_address']) }).strict(),
  z.object({ kind:z.literal('error'), error }).strict(),
]);
export const deliveryCreateRequestSchema = z.object({
  version:z.literal(1), scope:deliveryScopeSchema, providerId:deliveryIdSchema, orderRef:deliveryIdSchema, attemptRef:deliveryIdSchema,
  quoteRef:nativeReference, requestDigest:z.string().regex(/^[a-f0-9]{64}$/), readyAt:instant,
  deliveryInterval:deliveryIntervalSchema.nullable(), quotedCost:deliveryMoneySchema,
  fulfillment:deliveryQuoteRequestSchema,
}).strict().refine(v => v.scope.brandId === v.fulfillment.scope.brandId && v.scope.locationId === v.fulfillment.scope.locationId && v.providerId === v.fulfillment.providerId, 'Fulfillment scope/provider mismatch').refine(v => Date.parse(v.readyAt) === Date.parse(v.fulfillment.readyAt), 'Ready time mismatch').refine(v => {
  const desired = v.fulfillment.desiredDelivery;
  return desired.kind === 'asap' ? v.deliveryInterval === null : v.deliveryInterval !== null && Date.parse(v.deliveryInterval.earliest) === Date.parse(desired.interval.earliest) && Date.parse(v.deliveryInterval.latest) === Date.parse(desired.interval.latest);
}, 'Requested delivery interval mismatch');
const accepted = z.object({ kind:z.literal('accepted'), providerDeliveryId:nativeReference, nativeReference:nativeReference,
  trackingUrl:tracking, pickupEstimateProvenance:pickupEstimateProvenanceSchema.nullable(), pickupInterval:deliveryIntervalSchema.nullable(), deliveryInterval:deliveryIntervalSchema.nullable(), cost:deliveryMoneySchema.nullable() }).strict();
export const deliveryCreateResultSchema = z.discriminatedUnion('kind', [accepted,
  z.object({kind:z.literal('rejected'),error}).strict(),
  z.object({kind:z.literal('unknown'),attemptRef:deliveryIdSchema,error}).strict(),
]);
export const deliveryReconcileResultSchema = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('found'), delivery:accepted}).strict(),
  z.object({kind:z.literal('confirmed_absent'), evidenceReference:nativeReference, checkedAt:instant, authoritativeThrough:instant}).strict(),
  z.object({kind:z.literal('unknown'),error}).strict(), z.object({kind:z.literal('unsupported')}).strict(),
]);
export const deliveryCancelResultSchema = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('cancelled'),fee:deliveryMoneySchema.nullable()}).strict(),
  z.object({kind:z.literal('not_cancellable'),error}).strict(), z.object({kind:z.literal('unknown'),error}).strict(),
  z.object({kind:z.literal('unsupported')}).strict(),
]);
export const verifiedDeliveryEventSchema = z.object({
  version:z.literal(1), scope:deliveryScopeSchema, providerId:deliveryIdSchema, eventRef:nativeReference,
  providerDeliveryId:nativeReference, occurredAt:instant.nullable(), dispatchedAt:instant.nullable(), receivedAt:instant, sequence:integer.nullable(),
  status:z.enum(['booked','courier_assigned','courier_to_pickup','picked_up','delivered','cancelled','failed']).nullable(), nativeStatus:text(100),
  pickupEstimateProvenance:pickupEstimateProvenanceSchema.nullable(), pickupInterval:deliveryIntervalSchema.nullable(), deliveryInterval:deliveryIntervalSchema.nullable(), nativeErrorCode:text(100).nullable(),
}).strict();
export type DeliveryScope = z.infer<typeof deliveryScopeSchema>;
export type DeliveryMoney = z.infer<typeof deliveryMoneySchema>;
export type RouteDistance = z.infer<typeof routeDistanceSchema>;
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;
export type DeliveryQuoteRequest = z.infer<typeof deliveryQuoteRequestSchema>;
export type DeliveryQuoteResult = z.infer<typeof deliveryQuoteResultSchema>;
export type DeliveryCreateRequest = z.infer<typeof deliveryCreateRequestSchema>;
export type DeliveryCreateResult = z.infer<typeof deliveryCreateResultSchema>;
export type DeliveryReconcileResult = z.infer<typeof deliveryReconcileResultSchema>;
export type DeliveryCancelResult = z.infer<typeof deliveryCancelResultSchema>;
export type VerifiedDeliveryEvent = z.infer<typeof verifiedDeliveryEventSchema>;
export const managedDeliveryBindingSchema = z.object({version:z.literal(1), providerId:deliveryIdSchema, quoteRef:nativeReference, requestDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type ManagedDeliveryBinding = z.infer<typeof managedDeliveryBindingSchema>;
export const deliveryReconcileRequestSchema = z.object({scope:deliveryScopeSchema, attemptRef:deliveryIdSchema, providerDeliveryId:nativeReference.nullable()}).strict();
export const deliveryCancelRequestSchema = z.object({scope:deliveryScopeSchema, providerDeliveryId:nativeReference, attemptRef:deliveryIdSchema, operatorReason:text(500), acceptedFee:deliveryMoneySchema.nullable(), feeQuoteRef:nativeReference.nullable(), feeQuoteRevision:integer.nullable()}).strict().refine(v => v.acceptedFee === null ? v.feeQuoteRef === null && v.feeQuoteRevision === null : v.feeQuoteRef !== null && v.feeQuoteRevision !== null, 'Accepted fee requires quote identity and revision');
export type DeliveryReconcileRequest = z.infer<typeof deliveryReconcileRequestSchema>;
export type DeliveryCancelRequest = z.infer<typeof deliveryCancelRequestSchema>;
export interface DeliveryProvider {
  readonly providerId: string;
  readonly capabilities: ProviderCapabilities;
  quote(request: DeliveryQuoteRequest): Promise<DeliveryQuoteResult>;
  create(request: DeliveryCreateRequest): Promise<DeliveryCreateResult>;
  reconcile(request: DeliveryReconcileRequest): Promise<DeliveryReconcileResult>;
  cancel(request: DeliveryCancelRequest): Promise<DeliveryCancelResult>;
}
// Shared persistence contracts are server-only implementations, not public mutation APIs.
export const authorizedDeliveryBindingSchema=z.object({scope:deliveryScopeSchema,providerId:deliveryIdSchema,environment:z.enum(['sandbox','production']),active:z.literal(true),revision:integer,merchantRef:nativeReference,venueRef:nativeReference,secretRef:nativeReference}).strict();
export type AuthorizedDeliveryBinding=z.infer<typeof authorizedDeliveryBindingSchema>;
export interface DeliveryBindingStore {
  resolveBinding(scope:DeliveryScope, providerId:string):Promise<AuthorizedDeliveryBinding|null>;
}
export interface DeliveryAttemptStore {
  claimAttempt(request:DeliveryCreateRequest):Promise<{revision:number; attemptRef:string; state:'pending'|'submitting'|'unknown'|'accepted'|'rejected'; existing:boolean}>;
  recordAttemptResult(scope:DeliveryScope, attemptRef:string, expectedRevision:number, result:DeliveryCreateResult):Promise<{revision:number}>;
}
export interface DeliveryEventInbox {
  appendVerifiedEvent(event:VerifiedDeliveryEvent):Promise<{duplicate:boolean; applied:boolean}>;
}
