import { copenhagenDay } from './day';

// Shared filter state for every page under Loyalitet. It lives in the URL, so
// links and reloads keep it, and is remembered between those pages per browser tab.
export const PERIOD_PRESETS = ['today', '7d', '30d', 'thisMonth', 'lastMonth', 'custom'] as const;
export type PeriodPreset = typeof PERIOD_PRESETS[number];
export const CHANNELS = ['dine_in', 'takeaway'] as const;
export type LoyaltyFilters = { company: string | null; brands: string[]; period: PeriodPreset; from: string; to: string; channel: string | null; actor: string | null };
export const FILTER_KEYS = ['company', 'brand', 'period', 'from', 'to', 'channel', 'actor'] as const;

const shift = (day: string, days: number) => new Date(Date.parse(day + 'T12:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);

export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, now: number) {
  const today = copenhagenDay(now), [y, m] = today.split('-').map(Number);
  const monthStart = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-01`;
  switch (preset) {
    case 'today': return { from: today, to: today };
    case '7d': return { from: shift(today, -6), to: today };
    case '30d': return { from: shift(today, -29), to: today };
    case 'thisMonth': return { from: monthStart(y, m), to: today };
    case 'lastMonth': {
      const start = m === 1 ? monthStart(y - 1, 12) : monthStart(y, m - 1);
      return { from: start, to: shift(monthStart(y, m), -1) };
    }
  }
}

const dayPattern = /^\d{4}-\d{2}-\d{2}$/, idPattern = /^[A-Za-z0-9_-]{1,128}$/;

// Parses untrusted URL parameters. Brand access is enforced by the server
// queries; this only normalizes the request.
export function parseFilters(params: Record<string, string | string[] | undefined>, now: number): LoyaltyFilters {
  const one = (key: string) => { const v = params[key]; return Array.isArray(v) ? v[0] : v; };
  const period = (PERIOD_PRESETS as readonly string[]).includes(one('period') || '') ? one('period') as PeriodPreset : '30d';
  let range = period === 'custom' ? { from: one('from') || '', to: one('to') || '' } : presetRange(period, now);
  if (!dayPattern.test(range.from) || !dayPattern.test(range.to) || range.from > range.to) range = presetRange('30d', now);
  const brands = (one('brand') || '').split(',').filter(b => idPattern.test(b)).slice(0, 50);
  const company = one('company');
  return {
    company: company && idPattern.test(company) ? company : null, brands, period, ...range,
    channel: (CHANNELS as readonly string[]).includes(one('channel') || '') ? one('channel')! : null,
    actor: /^[a-f0-9]{64}$/.test(one('actor') || '') ? one('actor')! : null,
  };
}

export function filterQuery(filters: LoyaltyFilters, extra: Record<string, string> = {}) {
  const query = new URLSearchParams(extra);
  if (filters.company) query.set('company', filters.company);
  if (filters.brands.length) query.set('brand', filters.brands.join(','));
  query.set('period', filters.period);
  if (filters.period === 'custom') { query.set('from', filters.from); query.set('to', filters.to); }
  if (filters.channel) query.set('channel', filters.channel);
  if (filters.actor) query.set('actor', filters.actor);
  return query.toString();
}
