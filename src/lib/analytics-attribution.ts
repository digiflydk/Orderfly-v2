import type { AnalyticsAttribution } from '@/types';

const TEXT_LIMIT = 160;
const CLICK_ID_LIMIT = 256;

function clean(value: unknown, limit = TEXT_LIMIT): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, limit);
  return normalized && /^[\p{L}\p{N} _.,:+\-/]+$/u.test(normalized) ? normalized : undefined;
}

function path(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().slice(0, 500);
  return normalized.startsWith('/') && !normalized.includes('?') && !normalized.includes('#') ? normalized : undefined;
}

function host(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const parsed = new URL(value);
    return clean(parsed.hostname.toLowerCase(), 253);
  } catch {
    return clean(value.toLowerCase(), 253);
  }
}

export function normalizeAttribution(input: Record<string, unknown> | null | undefined): AnalyticsAttribution | undefined {
  if (!input) return undefined;
  const result: AnalyticsAttribution = {
    source: clean(input.source ?? input.utm_source),
    medium: clean(input.medium ?? input.utm_medium),
    campaign: clean(input.campaign ?? input.utm_campaign),
    campaignId: clean(input.campaignId ?? input.utm_id),
    term: clean(input.term ?? input.utm_term),
    content: clean(input.content ?? input.utm_content),
    gclid: clean(input.gclid, CLICK_ID_LIMIT),
    gbraid: clean(input.gbraid, CLICK_ID_LIMIT),
    wbraid: clean(input.wbraid, CLICK_ID_LIMIT),
    fbclid: clean(input.fbclid, CLICK_ID_LIMIT),
    landingPath: path(input.landingPath ?? input.landing_page),
    referrerHost: host(input.referrerHost ?? input.referrer),
  };
  const compact = Object.fromEntries(Object.entries(result).filter(([, value]) => value !== undefined)) as AnalyticsAttribution;
  return Object.keys(compact).length ? compact : undefined;
}

export function campaignAttribution(search: URLSearchParams, pathname: string, referrer: string): AnalyticsAttribution | undefined {
  return normalizeAttribution({
    utm_source: search.get('utm_source'), utm_medium: search.get('utm_medium'),
    utm_campaign: search.get('utm_campaign'), utm_id: search.get('utm_id'),
    utm_term: search.get('utm_term'), utm_content: search.get('utm_content'),
    gclid: search.get('gclid'), gbraid: search.get('gbraid'), wbraid: search.get('wbraid'), fbclid: search.get('fbclid'),
    landingPath: pathname, referrer,
  });
}

export function resolveAttribution(current: AnalyticsAttribution | undefined, stored: AnalyticsAttribution | undefined) {
  const tagged = current && ['source','medium','campaign','campaignId','term','content','gclid','gbraid','wbraid','fbclid'].some(key => Boolean(current[key as keyof AnalyticsAttribution]));
  return tagged ? current : stored || current;
}
