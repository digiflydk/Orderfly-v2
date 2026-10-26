import 'server-only';
import { z } from 'zod';

const id = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:-]+$/);
const text = z.string().trim().min(1).max(500);
const instant = z.string().datetime({ offset: true });
const coordinates = z.object({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180) }).strict();
const money = z.object({ amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currency: z.string().regex(/^[A-Z]{3}$/) });
const scope = z.object({ brandId: id, locationId: id }).strict();
const parcel = z.object({
  count: z.number().int().min(1).max(100), description: text, identifier: id,
  price: money.optional(),
  dimensions: z.object({ weight_gram: z.number().int().positive(), width_cm: z.number().positive(), height_cm: z.number().positive(), depth_cm: z.number().positive() }).strict().optional(),
}).strict();

// These values must come from the immutable scoped quote and binding repositories,
// never directly from an unauthenticated checkout payload.
export const woltCreateInputSchema = z.object({
  scope,
  binding: scope.extend({ venueId: id }).strict(),
  quote: scope.extend({
    venueId: id, promiseId: id, validUntil: instant.nullable(), fetchedAt: instant, isBinding: z.literal(true),
    dropoff: z.object({ coordinates, formattedAddress: text }).strict(),
    scheduledDropoffTime: instant.nullable(),
  }).strict(),
  merchantOrderReferenceId: id,
  recipient: z.object({ name: z.string().trim().min(1).max(120), phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/), email: z.string().email().max(254).optional() }).strict(),
  parcels: z.array(parcel).min(1).max(100),
  pickupComment: z.string().max(500).optional(), dropoffComment: z.string().max(500).optional(),
  isNoContact: z.boolean().default(false), bagCount: z.number().int().min(1).max(100).optional(),
  customerSupport: z.object({ email: z.string().email().optional(), phoneNumber: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(), url: z.string().url().refine(v => new URL(v).protocol === 'https:').optional() }).strict().optional(),
}).strict();
export type WoltCreateInput = z.input<typeof woltCreateInputSchema>;
export type WoltWriteResponse = { ok: true; status: number; data: unknown } | { ok: false; error: { code: string; nativeCode?: string; retryClass: 'never' | 'read_only' | 'after_reconciliation'; outcome: 'rejected' | 'unknown'; status?: number } };
export type WoltWriteTransport = (request: { method: 'POST' | 'PATCH'; path: string; body: unknown; operation: 'create' | 'cancel' }) => Promise<WoltWriteResponse>;
export type WoltCreateResult =
  | { kind: 'accepted'; providerDeliveryId: string; woltOrderReferenceId: string; merchantOrderReferenceId: string; trackingUrl: string | null; nativeStatus: string; pickupEta: string | null; dropoffEta: string | null; providerCost: { amount: number; currency: string; taxBasis: 'inclusive' } | null }
  | { kind: 'rejected'; code: string }
  | { kind: 'unknown'; code: string; merchantOrderReferenceId: string; reconciliation: 'verified_event_or_manual' };

export function buildWoltCreateRequest(raw: WoltCreateInput, now: Date) {
  const input = woltCreateInputSchema.parse(raw);
  if (!Number.isFinite(now.getTime())) throw new Error('INVALID_CLOCK');
  for (const bound of [input.binding, input.quote]) {
    if (bound.brandId !== input.scope.brandId || bound.locationId !== input.scope.locationId) throw new Error('SCOPE_MISMATCH');
  }
  if (input.binding.venueId !== input.quote.venueId) throw new Error('VENUE_MISMATCH');
  const age = now.getTime() - Date.parse(input.quote.fetchedAt);
  if (age < 0 || age >= 300_000 || (input.quote.validUntil !== null && Date.parse(input.quote.validUntil) <= now.getTime())) throw new Error('QUOTE_EXPIRED');
  return {
    method: 'POST' as const, operation: 'create' as const,
    path: `/v1/venues/${encodeURIComponent(input.binding.venueId)}/deliveries`,
    body: {
      shipment_promise_id: input.quote.promiseId,
      merchant_order_reference_id: input.merchantOrderReferenceId,
      pickup: { comment: input.pickupComment },
      dropoff: {
        location: { coordinates: input.quote.dropoff.coordinates, formatted_address: input.quote.dropoff.formattedAddress },
        comment: input.dropoffComment,
        options: { is_no_contact: input.isNoContact, ...(input.quote.scheduledDropoffTime ? { scheduled_time: input.quote.scheduledDropoffTime } : {}) },
      },
      recipient: { name: input.recipient.name, phone_number: input.recipient.phoneNumber, email: input.recipient.email },
      parcels: input.parcels,
      bag_count: input.bagCount,
      ...(input.customerSupport ? { customer_support: { email: input.customerSupport.email, phone_number: input.customerSupport.phoneNumber, url: input.customerSupport.url } } : {}),
    },
  };
}

const responseSchema = z.object({
  id, wolt_order_reference_id: id, merchant_order_reference_id: id.optional(), status: z.string().min(1).max(100),
  tracking: z.object({ url: z.string().url().refine(v => new URL(v).protocol === 'https:' && !new URL(v).username && !new URL(v).password) }).optional(),
  pickup: z.object({ eta: instant.nullable().optional() }).optional(),
  dropoff: z.object({ eta: instant.nullable().optional() }).optional(),
  price: money.optional(),
});

export function mapWoltCreateResponse(response: WoltWriteResponse, reference: string): WoltCreateResult {
  const unknown = (code: string): WoltCreateResult => ({ kind: 'unknown', code, merchantOrderReferenceId: reference, reconciliation: 'verified_event_or_manual' });
  if (!response.ok) {
    if (response.error.outcome === 'unknown' || response.error.nativeCode === 'DUPLICATE_ORDER') return unknown(response.error.nativeCode === 'DUPLICATE_ORDER' ? 'DUPLICATE_ORDER' : 'CREATE_OUTCOME_UNKNOWN');
    return { kind: 'rejected', code: response.error.code };
  }
  const parsed = responseSchema.safeParse(response.data);
  if (response.status !== 201 || !parsed.success) return unknown('INVALID_CREATE_RESPONSE');
  const data = parsed.data;
  if (data.status !== 'INFO_RECEIVED') return unknown('UNEXPECTED_CREATE_STATUS');
  if (data.merchant_order_reference_id && data.merchant_order_reference_id !== reference) return unknown('REFERENCE_MISMATCH');
  return { kind: 'accepted', providerDeliveryId: data.id, woltOrderReferenceId: data.wolt_order_reference_id, merchantOrderReferenceId: reference, trackingUrl: data.tracking?.url ?? null, nativeStatus: data.status, pickupEta: data.pickup?.eta ?? null, dropoffEta: data.dropoff?.eta ?? null, providerCost: data.price ? { ...data.price, taxBasis: 'inclusive' } : null };
}

export async function createWoltDelivery(input: WoltCreateInput, transport: WoltWriteTransport, now: Date): Promise<WoltCreateResult> {
  // Validate before dispatch. The caller must durably claim the intent first.
  const request = buildWoltCreateRequest(input, now);
  const reference = request.body.merchant_order_reference_id;
  try { return mapWoltCreateResponse(await transport(request), reference); }
  catch { return { kind: 'unknown', code: 'CREATE_OUTCOME_UNKNOWN', merchantOrderReferenceId: reference, reconciliation: 'verified_event_or_manual' }; }
}
