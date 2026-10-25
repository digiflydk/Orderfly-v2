import 'server-only';

/** Accept explicit offset instants only; caller converts local Copenhagen wall time with DST disambiguation. */
export function woltInstant(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('Invalid Wolt instant');
  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/)!;
  const [,year,month,day,hour,minute,second,zone,,offsetHour,offsetMinute] = parts;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || (zone !== 'Z' && (Number(offsetHour) > 14 || Number(offsetMinute) > 59 || (Number(offsetHour) === 14 && Number(offsetMinute) !== 0)))) throw new Error('Invalid Wolt instant');
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('Invalid Wolt instant');
  return time;
}
export function woltTiming(input: { preparationMinutes: number; scheduledDropoffTime?: string }, nowMs: number) {
  if (!Number.isFinite(nowMs) || !Number.isInteger(input.preparationMinutes) || input.preparationMinutes < 0 || input.preparationMinutes > 60) throw new Error('Invalid preparation time');
  if (!input.scheduledDropoffTime) return { min_preparation_time_minutes: input.preparationMinutes };
  const scheduled = woltInstant(input.scheduledDropoffTime);
  const delta = scheduled - nowMs;
  if (delta < 60 * 60_000 || delta > 168 * 60 * 60_000) throw new Error('Scheduled delivery must be between one hour and seven days away');
  return { min_preparation_time_minutes: input.preparationMinutes, scheduled_dropoff_time: new Date(scheduled).toISOString() };
}
export function isWoltQuoteFresh(quote: { fetchedAt: string; validUntil: string | null }, nowMs: number, maxAgeMs: number): boolean {
  if (!Number.isFinite(nowMs) || !Number.isInteger(maxAgeMs) || maxAgeMs < 1 || maxAgeMs > 300_000) return false;
  try {
    const fetched = woltInstant(quote.fetchedAt);
    return nowMs >= fetched && nowMs < fetched + maxAgeMs && (quote.validUntil === null || nowMs < woltInstant(quote.validUntil));
  } catch { return false; }
}
