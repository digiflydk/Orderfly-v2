import 'server-only';
import type { RoutingAdapter, VerifiedAddress } from '../service';

const ENDPOINT = 'https://api-eu.geoapify.com';
const MAX_BYTES = 1_000_000;
const text = (value: unknown, max = 200): value is string => typeof value === 'string'
  && !!value.trim() && value.length <= max && !/[\p{Cc}\p{Cf}]/u.test(value);
const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da');
const point = (value: VerifiedAddress) => value && text(value.reference)
  && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
  && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
const samePoint = (a: VerifiedAddress, b: VerifiedAddress) => a.reference === b.reference
  && a.latitude === b.latitude && a.longitude === b.longitude;

/** One instance per quote. Credentials and quota reservations are server-owned dependencies. */
export function createGeoapifyRoutingAdapter(options: {
  apiKey: string; fetch: typeof fetch; timeoutMs?: number;
  reserveQuote: () => Promise<boolean>; reserveRequest: () => Promise<boolean>;
}): RoutingAdapter {
  const timeoutMs = options.timeoutMs ?? 4000;
  if (!text(options.apiKey, 300) || /\s/.test(options.apiKey) || typeof options.fetch !== 'function'
    || typeof options.reserveQuote !== 'function' || typeof options.reserveRequest !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw Error('invalid_routing_configuration');
  const { apiKey, fetch: fetchImpl, reserveQuote, reserveRequest } = options;
  let quoteReservation: Promise<boolean> | undefined;
  let geocodes = 0, routeUsed = false;
  const resolved: VerifiedAddress[] = [];
  const request = async (path: string, params: URLSearchParams): Promise<any> => {
    quoteReservation ??= Promise.resolve().then(() => reserveQuote()).then(value => value === true, () => false);
    if (!await quoteReservation || await reserveRequest() !== true) throw Error('routing_budget_unavailable');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Error('routing_timeout')); }, timeoutMs);
    });
    params.set('apiKey', apiKey);
    try {
      return await Promise.race([timeout, (async () => {
        const response = await fetchImpl(`${ENDPOINT}${path}?${params}`, {
          method: 'GET', redirect: 'error', cache: 'no-store', signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok || !response.body) throw Error('routing_response_unavailable');
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let size = 0, body = '';
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > MAX_BYTES) { controller.abort(); throw Error('routing_response_too_large'); }
            body += decoder.decode(chunk.value, { stream: true });
          }
          body += decoder.decode();
          return JSON.parse(body);
        } finally { await reader.cancel().catch(() => undefined); }
      })()]);
    } finally { if (timer) clearTimeout(timer); }
  };
  return {
    source: 'geoapify',
    async resolve(address) {
      if (!address || address.countryCode !== 'DK' || !text(address.street) || !/^\d{4}$/.test(address.postalCode)
        || !text(address.city, 120)) return { kind: 'invalid' };
      address = { street: address.street, postalCode: address.postalCode, city: address.city, countryCode: address.countryCode };
      const parts = address.street.normalize('NFKC').trim().match(/^(.+?)\s+(\d+[A-Za-z]?)$/u);
      if (!parts) return { kind: 'invalid' };
      if (geocodes++ >= 2) return { kind: 'unavailable' };
      try {
        const data = await request('/v1/geocode/search', new URLSearchParams({
          street: parts[1], housenumber: parts[2], postcode: address.postalCode, city: address.city,
          country: 'Denmark', filter: 'countrycode:dk', bias: 'countrycode:none', lang: 'da', format: 'json', limit: '2',
        }));
        if (!Array.isArray(data?.results)) return { kind: 'unavailable' };
        if (!data.results.length) return { kind: 'invalid' };
        if (data.results.length !== 1) return { kind: 'ambiguous' };
        const result = data.results[0];
        // Restrict the initial release to one known data license; static source attribution must accompany reuse.
        if (result?.datasource?.sourcename !== 'openstreetmap') return { kind: 'unavailable' };
        if (result.country_code !== 'dk' || result.postcode !== address.postalCode || result.result_type !== 'building'
          || !text(result.street) || !text(result.housenumber, 30)
          || normalize(result.street) !== normalize(parts[1]) || normalize(result.housenumber) !== normalize(parts[2])
          || typeof result.rank?.confidence !== 'number' || !Number.isFinite(result.rank.confidence) || result.rank.confidence < 0.95 || result.rank.confidence > 1
          || !['full_match', 'match_by_building'].includes(result.rank?.match_type)
          || (result.rank.confidence_building_level !== undefined && (typeof result.rank.confidence_building_level !== 'number'
            || !Number.isFinite(result.rank.confidence_building_level) || result.rank.confidence_building_level < 0.95 || result.rank.confidence_building_level > 1))) return { kind: 'ambiguous' };
        const verified = { reference: result.place_id, latitude: result.lat, longitude: result.lon };
        if (!point(verified)) return { kind: 'invalid' };
        resolved.push({ ...verified });
        return { kind: 'verified', address: verified };
      } catch { return { kind: 'unavailable' }; }
    },
    async route({ pickup, dropoff, profile }) {
      if (profile !== 'car' || !point(pickup) || !point(dropoff) || resolved.length !== 2
        || !samePoint(pickup, resolved[0]) || !samePoint(dropoff, resolved[1]) || routeUsed) return { kind: 'unavailable' };
      routeUsed = true;
      try {
        const data = await request('/v1/routing', new URLSearchParams({
          waypoints: `${pickup.latitude},${pickup.longitude}|${dropoff.latitude},${dropoff.longitude}`,
          mode: 'drive', type: 'balanced', traffic: 'free_flow', units: 'metric', format: 'geojson',
        }));
        if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) return { kind: 'unavailable' };
        if (!data.features.length) return { kind: 'no_route' };
        if (data.features.length !== 1) return { kind: 'unavailable' };
        const route = data.features[0]?.properties;
        if (route?.distance_units !== 'Meters' || typeof route.distance !== 'number' || !Number.isFinite(route.distance)
          || route.distance < 0 || typeof route.time !== 'number' || !Number.isFinite(route.time) || route.time < 0) return { kind: 'unavailable' };
        const meters = Math.ceil(route.distance), durationSeconds = Math.ceil(route.time);
        if (!Number.isSafeInteger(meters) || !Number.isSafeInteger(durationSeconds)) return { kind: 'unavailable' };
        return { kind: 'route', meters, durationSeconds };
      } catch { return { kind: 'unavailable' }; }
    },
  };
}
