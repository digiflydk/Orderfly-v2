import 'server-only';
import { z } from 'zod';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { getAdminDb } from '@/lib/firebase-admin';
import { assertFeedbackBrand, requireFeedbackAccess } from './access';
import { feedbackScopeOptions } from './admin-data';
import { feedbackTime, summarizeFeedback, type FeedbackMetricRow } from './metrics';

const timezone = 'Europe/Copenhagen';
const dayMs = 86400000;
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ugyldig dato.');
const filtersSchema = z.object({
  from: calendarDate, to: calendarDate,
  brandId: z.string().regex(/^[\w-]{1,160}$/).optional(),
  locationId: z.string().regex(/^[\w-]{1,160}$/).optional(),
  source: z.enum(['all', 'commerce_order', 'booking']).default('all'),
}).refine(v => v.from <= v.to && (Date.parse(v.to) - Date.parse(v.from)) / dayMs < 366, 'Vælg en periode på højst 366 dage i korrekt rækkefølge.');
export type FeedbackReportFilters = z.infer<typeof filtersSchema>;
export function reportFilters(input: Record<string, unknown>, now = new Date()) {
  const today = formatInTimeZone(now, timezone, 'yyyy-MM-dd');
  const from = new Date(Date.parse(today) - 29 * dayMs).toISOString().slice(0, 10);
  const filters = filtersSchema.parse({ from: input.from || from, to: input.to || today, brandId: input.brandId || undefined, locationId: input.locationId || undefined, source: input.source || 'all' });
  const nextDay = new Date(Date.parse(filters.to) + dayMs).toISOString().slice(0, 10);
  return { filters, start: fromZonedTime(filters.from + 'T00:00:00', timezone), end: fromZonedTime(nextDay + 'T00:00:00', timezone) };
}

export async function getFeedbackReport(input: Record<string, unknown>) {
  const access = await requireFeedbackAccess();
  const { filters, start, end } = reportFilters(input);
  if (filters.brandId) assertFeedbackBrand(access, filters.brandId);
  const options = await feedbackScopeOptions(access);
  if (filters.brandId && !options.brands.some(b => b.id === filters.brandId)) throw new Error('Brandet findes ikke.');
  if (filters.locationId && !options.locations.some(l => l.id === filters.locationId && (!filters.brandId || l.brandId === filters.brandId))) throw new Error('Lokationen er ikke tilgængelig for det valgte brand.');
  const brandIds = filters.brandId ? [filters.brandId] : access.brandIds;
  const scopes = brandIds === null ? [null] : brandIds;
  const collection = getAdminDb().collection('feedback');
  const results = await Promise.all(scopes.map(async brandId => {
    let query: FirebaseFirestore.Query = collection.where('receivedAt', '>=', start).where('receivedAt', '<', end);
    if (brandId) query = query.where('brandId', '==', brandId);
    // Return an explicit limit error instead of calculating KPIs from a truncated sample.
    const result = await query.limit(5001).get();
    if (result.size > 5000 || result.docs.length > 5000) throw new Error('Perioden indeholder for mange svar. Vælg en kortere periode.');
    return result.docs.map(d => d.data() as FeedbackMetricRow);
  }));
  const rows = results.flat().filter(row => {
    const date = feedbackTime(row.receivedAt);
    return date && date >= start && date < end &&
      (!filters.locationId || row.locationId === filters.locationId) &&
      (filters.source === 'all' || (row.sourceType === 'booking' ? 'booking' : 'commerce_order') === filters.source);
  });
  if (rows.length > 5000) throw new Error('Perioden indeholder for mange svar. Vælg et brand eller en kortere periode.');
  const selectedLocations = options.locations.filter(l => (!filters.brandId || l.brandId === filters.brandId) && (!filters.locationId || l.id === filters.locationId));
  const locations = selectedLocations.map(location => ({
    id: location.id, name: location.name, brandName: options.brands.find(b => b.id === location.brandId)?.name || location.brandId,
    ...summarizeFeedback(rows.filter(r => r.locationId === location.id && r.brandId === location.brandId)),
  }));
  const days = new Map<string, FeedbackMetricRow[]>();
  for (const row of rows) {
    const day = formatInTimeZone(feedbackTime(row.receivedAt)!, timezone, 'yyyy-MM-dd');
    days.set(day, [...(days.get(day) || []), row]);
  }
  return {
    filters, ...options, summary: summarizeFeedback(rows), locationSummary: locations,
    daily: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({ date, ...summarizeFeedback(values) })),
    unknownLocationResponses: rows.filter(r => !selectedLocations.some(l => l.id === r.locationId && l.brandId === r.brandId)).length,
    generatedAt: new Date().toISOString(),
  };
}
export type FeedbackReport = Awaited<ReturnType<typeof getFeedbackReport>>;
