import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const ANALYTICS_TIMEZONE = 'Europe/Copenhagen';
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function analyticsCalendarDay(value: string | Date): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Ugyldig analysedato.');
    return formatInTimeZone(value, ANALYTICS_TIMEZONE, 'yyyy-MM-dd');
  }
  if (dayPattern.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value;
    throw new Error('Ugyldig analysedato.');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Ugyldig analysedato.');
  return formatInTimeZone(parsed, ANALYTICS_TIMEZONE, 'yyyy-MM-dd');
}

function shiftCalendarDay(day: string, amount: number): string {
  const timestamp = Date.parse(`${day}T00:00:00.000Z`);
  return new Date(timestamp + amount * millisecondsPerDay).toISOString().slice(0, 10);
}

export function analyticsDateRange(from: string | Date, to: string | Date) {
  const first = analyticsCalendarDay(from);
  const last = analyticsCalendarDay(to);
  if (first > last) throw new Error('Startdato skal være før eller lig med slutdato.');
  return {
    start: fromZonedTime(`${first}T00:00:00`, ANALYTICS_TIMEZONE),
    endExclusive: fromZonedTime(`${shiftCalendarDay(last, 1)}T00:00:00`, ANALYTICS_TIMEZONE),
  };
}

export function analyticsDateKeys(from: string | Date, to: string | Date): string[] {
  const first = analyticsCalendarDay(from);
  const last = analyticsCalendarDay(to);
  if (first > last) throw new Error('Startdato skal være før eller lig med slutdato.');
  const dates: string[] = [];
  for (let day = first; day <= last; day = shiftCalendarDay(day, 1)) dates.push(day);
  return dates;
}

export function analyticsToday(now = new Date()): string {
  return analyticsCalendarDay(now);
}

export function analyticsShiftDay(day: string, amount: number): string {
  return shiftCalendarDay(analyticsCalendarDay(day), amount);
}
