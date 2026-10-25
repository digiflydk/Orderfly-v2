import type { RouteDistance } from '../pricing/calculate';

/** Server-owned adapter boundary. Never deserialize an adapter from client input. */
export type DeliveryAddress = { street: string; postalCode: string; city: string; countryCode: string };
export type VerifiedAddress = { reference: string; latitude: number; longitude: number };
export type RoutingAdapter = {
  source: string;
  resolve(address: DeliveryAddress): Promise<{ kind: 'verified'; address: VerifiedAddress } | { kind: 'invalid' | 'ambiguous' | 'unavailable' }>;
  route(input: { pickup: VerifiedAddress; dropoff: VerifiedAddress; profile: string }): Promise<
    { kind: 'route'; meters: number; durationSeconds: number } | { kind: 'no_route' | 'unavailable' }>;
};
export type RouteEvidence = RouteDistance & {
  pickupReference: string; dropoffReference: string; durationSeconds: number;
};
export type RoutingResult = { ok: true; route: RouteEvidence } | { ok: false; reason:
  'routing_unconfigured' | 'invalid_address' | 'ambiguous_address' | 'routing_unavailable' | 'no_route' | 'invalid_route' };
const text = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 200;
function validAddress(a: DeliveryAddress): boolean {
  return !!a && text(a.street) && text(a.postalCode) && text(a.city) && typeof a.countryCode === 'string' && /^[A-Z]{2}$/.test(a.countryCode);
}
function verified(a: VerifiedAddress): boolean {
  return !!a && text(a.reference) && Number.isFinite(a.latitude) && Number.isFinite(a.longitude)
    && Math.abs(a.latitude) <= 90 && Math.abs(a.longitude) <= 180;
}
/** Resolves BOTH addresses itself. Caller-supplied coordinates and route costs are never accepted. */
export async function resolveDeliveryRoute(input: { pickup: DeliveryAddress; dropoff: DeliveryAddress; profile: string },
  dependencies: { adapter: RoutingAdapter | null; now: () => Date }): Promise<RoutingResult> {
  if (!validAddress(input?.pickup) || !validAddress(input?.dropoff) || !text(input?.profile)) return { ok: false, reason: 'invalid_address' };
  const adapter = dependencies.adapter;
  if (!adapter) return { ok: false, reason: 'routing_unconfigured' };
  if (!text(adapter.source)) return { ok: false, reason: 'routing_unavailable' };
  try {
    // Project allow-listed address fields; client extras such as coordinates cannot leak into resolution.
    const project = (a: DeliveryAddress): DeliveryAddress => ({street:a.street.trim(),postalCode:a.postalCode.trim(),city:a.city.trim(),countryCode:a.countryCode});
    const pickup = await adapter.resolve(project(input.pickup));
    const dropoff = await adapter.resolve(project(input.dropoff));
    for (const result of [pickup, dropoff]) {
      if (result.kind === 'invalid') return {ok:false,reason:'invalid_address'};
      if (result.kind === 'ambiguous') return {ok:false,reason:'ambiguous_address'};
      if (result.kind !== 'verified') return {ok:false,reason:'routing_unavailable'};
      if (!verified(result.address)) return {ok:false,reason:'invalid_address'};
    }
    if (pickup.kind !== 'verified' || dropoff.kind !== 'verified') return {ok:false,reason:'routing_unavailable'};
    const result = await adapter.route({pickup:pickup.address,dropoff:dropoff.address,profile:input.profile});
    if (result.kind === 'no_route') return {ok:false,reason:'no_route'};
    if (result.kind !== 'route') return {ok:false,reason:'routing_unavailable'};
    if (![result.meters,result.durationSeconds].every(n=>Number.isSafeInteger(n)&&n>=0)) return {ok:false,reason:'invalid_route'};
    const date = dependencies.now();
    if (!Number.isFinite(date.getTime())) return {ok:false,reason:'invalid_route'};
    return {ok:true,route:{meters:result.meters,durationSeconds:result.durationSeconds,method:'route',source:adapter.source,
      profile:input.profile,calculatedAt:date.toISOString(),pickupReference:pickup.address.reference,dropoffReference:dropoff.address.reference}};
  } catch { return {ok:false,reason:'routing_unavailable'}; }
}
