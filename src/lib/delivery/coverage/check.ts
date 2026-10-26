import { isRouteDistance } from '../pricing/calculate';
import type { RouteEvidence } from '../routing/service';
/** Inputs are composed by server orchestration, never authoritative client booleans. */
export type CoverageInput = {
  settings: { maxDistanceMeters: number; maxTransportMinutes: number };
  schedule: { open: boolean; reason: 'open' | 'disabled' | 'paused' | 'closed' };
  route: RouteEvidence | null;
  areaAllowed: boolean;
  providerAvailable: boolean;
  nowMs: number; maxRouteAgeMs: number;
};
export type CoverageResult = { eligible: true } | { eligible: false; reason:
  'invalid_input' | 'disabled' | 'paused' | 'closed' | 'route_unavailable' | 'stale_route' | 'outside_area' | 'transport_too_long' | 'provider_unavailable' };
export function checkDeliveryCoverage(i: CoverageInput): CoverageResult {
  const no = (reason: Exclude<CoverageResult,{eligible:true}>['reason']): CoverageResult => ({eligible:false,reason});
  if (!i || !i.settings || !i.schedule || typeof i.areaAllowed!=='boolean' || typeof i.providerAvailable!=='boolean'
    || ![i.settings.maxDistanceMeters,i.settings.maxTransportMinutes,i.nowMs,i.maxRouteAgeMs].every(n=>Number.isSafeInteger(n)&&n>=0)) return no('invalid_input');
  if (!['open','disabled','paused','closed'].includes(i.schedule.reason) || i.schedule.open !== (i.schedule.reason==='open')) return no('invalid_input');
  if (i.schedule.reason !== 'open') return no(i.schedule.reason);
  const r=i.route;
  if (!r || !isRouteDistance(r) || !Number.isSafeInteger(r.durationSeconds) || r.durationSeconds<0
    || typeof r.pickupReference!=='string' || !r.pickupReference.trim() || typeof r.dropoffReference!=='string' || !r.dropoffReference.trim()) return no('route_unavailable');
  const age=i.nowMs-Date.parse(r.calculatedAt);
  if (age<0 || age>i.maxRouteAgeMs) return no('stale_route');
  if (!i.areaAllowed || r.meters>i.settings.maxDistanceMeters) return no('outside_area');
  if (BigInt(r.durationSeconds)>BigInt(i.settings.maxTransportMinutes)*BigInt(60)) return no('transport_too_long');
  if (!i.providerAvailable) return no('provider_unavailable');
  return {eligible:true};
}
