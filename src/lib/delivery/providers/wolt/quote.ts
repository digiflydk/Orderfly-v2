import 'server-only';
import { z } from 'zod';
import type { WoltHttpClient, WoltHttpError } from './http';
import { woltInstant, woltTiming } from './schedule';

const currency = z.string().regex(/^[A-Z]{3}$/);
const money = z.object({ amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), currency });
const coordinates = z.object({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180) });
const instant = z.string().refine(v => { try { woltInstant(v); return true; } catch { return false; } });
const dimensions = z.object({ weight_gram: z.number().finite().nonnegative().optional(), width_cm: z.number().finite().nonnegative().optional(), height_cm: z.number().finite().nonnegative().optional(), depth_cm: z.number().finite().nonnegative().optional() });
const parcel = z.object({ count: z.number().int().positive().max(1000), dimensions: dimensions.optional(), price: money.optional() });
const inputSchema = z.object({
  venueId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  address: z.object({ street: z.string().trim().min(1).max(300), building: z.string().trim().min(1).max(30), city: z.string().trim().min(1).max(100), postCode: z.string().trim().min(1).max(30), coordinates: coordinates.optional() }),
  preparationMinutes: z.number().int().min(0).max(60), scheduledDropoffTime: instant.optional(),
  parcels: z.array(parcel).min(1).max(100),
});
export type WoltQuoteInput = z.infer<typeof inputSchema>;
const responseSchema = z.object({
  id: z.string().min(1).max(200), created_at: instant, valid_until: instant.nullish(), is_binding: z.boolean(), price: money,
  pickup: z.object({ venue_id: z.string().min(1), eta_minutes: z.number().finite().nonnegative().max(10080).nullish() }),
  dropoff: z.object({ location: z.object({ coordinates, formatted_address: z.string().min(1).max(1000) }), eta_minutes: z.number().finite().nonnegative().max(10080).nullish(), options: z.object({ scheduled_time: instant.nullish() }).nullish() }),
});
export type WoltQuoteBinding = {
  promiseId: string; venueId: string; validUntil: string | null; fetchedAt: string;
  dropoff: { coordinates: { lat: number; lon: number }; formattedAddress: string };
  scheduledDropoffTime: string | null; preparationMinutes: number;
};
export type WoltQuoteResult =
 | { status: 'available'; provider: 'wolt'; quoteReference: string; cost: { amount: number; currency: string; taxBasis: 'inclusive'; taxAmount: null; taxRate: null }; expiresAt: string | null; pickupEstimate: { earliest: string; latest: string } | null; deliveryEstimate: { earliest: string; latest: string } | null; pickupEtaReliable: false; distance: null; native: WoltQuoteBinding }
 | { status: 'unavailable'; reason: string }
 | { status: 'error'; error: WoltHttpError };

/** Input venue must come from the server-scoped binding resolver, never a browser-selected venue. */
export async function requestWoltQuote(client: WoltHttpClient, rawInput: WoltQuoteInput, nowMs = Date.now()): Promise<WoltQuoteResult> {
  const parsed = inputSchema.safeParse(rawInput);
  const invalid = (): WoltQuoteResult => ({ status: 'error', error: { code: 'invalid_request', retryClass: 'never', outcome: 'rejected' } });
  if (!parsed.success || !Number.isFinite(nowMs)) return invalid();
  const input = parsed.data;
  let timing: ReturnType<typeof woltTiming>;
  try { timing = woltTiming(input, nowMs); } catch { return { status: 'unavailable', reason: 'unsupported_schedule' }; }
  const response = await client.request({ method: 'POST', path: `/v1/venues/${input.venueId}/shipment-promises`, operation: 'quote', body: {
    street: `${input.address.street} ${input.address.building}`, city: input.address.city, post_code: input.address.postCode,
    ...(input.address.coordinates ?? {}), ...timing, parcels: input.parcels,
  } });
  if (!response.ok) return response.error.code === 'unavailable' ? { status: 'unavailable', reason: response.error.nativeCode ?? 'unavailable' } : { status: 'error', error: response.error };
  const result = responseSchema.safeParse(response.data);
  const badResponse = (): WoltQuoteResult => ({ status: 'error', error: { code: 'invalid_response', retryClass: 'never', outcome: 'rejected', status: response.status } });
  if (!result.success || response.status !== 201) return badResponse();
  const data = result.data;
  if (data.pickup.venue_id !== input.venueId) return badResponse();
  if (!data.is_binding) return { status: 'unavailable', reason: 'nonbinding_quote' };
  if (data.valid_until && woltInstant(data.valid_until) <= nowMs) return { status: 'unavailable', reason: 'expired_quote' };
  const created = woltInstant(data.created_at);
  const point = (value: number | null | undefined) => value == null ? null : { earliest: new Date(created + value * 60_000).toISOString(), latest: new Date(created + value * 60_000).toISOString() };
  const scheduled = data.dropoff.options?.scheduled_time ?? null;
  if (input.scheduledDropoffTime && (!scheduled || woltInstant(scheduled) !== woltInstant(input.scheduledDropoffTime))) return badResponse();
  if (!input.scheduledDropoffTime && scheduled) return badResponse();
  return {
    status: 'available', provider: 'wolt', quoteReference: data.id, cost: { ...data.price, taxBasis: 'inclusive', taxAmount: null, taxRate: null },
    expiresAt: data.valid_until ?? null, pickupEstimate: point(data.pickup.eta_minutes),
    deliveryEstimate: scheduled ? { earliest: scheduled, latest: scheduled } : point(data.dropoff.eta_minutes),
    pickupEtaReliable: false, distance: null,
    native: { promiseId: data.id, venueId: input.venueId, validUntil: data.valid_until ?? null, fetchedAt: new Date(nowMs).toISOString(), dropoff: { coordinates: data.dropoff.location.coordinates, formattedAddress: data.dropoff.location.formatted_address }, scheduledDropoffTime: scheduled, preparationMinutes: input.preparationMinutes },
  };
}
