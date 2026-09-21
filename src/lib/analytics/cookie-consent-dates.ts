import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { z } from 'zod';

export const COOKIE_REPORT_TIMEZONE = 'Europe/Copenhagen';

export function cookieReportDay(now = new Date()) {
  return formatInTimeZone(now, COOKIE_REPORT_TIMEZONE, 'yyyy-MM-dd');
}

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ugyldig dato.');

export function cookieConsentDateRange(from: string | Date, to: string | Date) {
  const first = calendarDay.parse(from instanceof Date ? cookieReportDay(from) : from);
  const last = calendarDay.parse(to instanceof Date ? cookieReportDay(to) : to);
  if (first > last) throw new Error('Startdato skal være før eller lig med slutdato.');
  // Advance the calendar date, then convert each midnight independently for DST.
  const nextDay = new Date(Date.parse(last) + 86400000).toISOString().slice(0, 10);
  return {
    start: fromZonedTime(first + 'T00:00:00', COOKIE_REPORT_TIMEZONE),
    end: fromZonedTime(nextDay + 'T00:00:00', COOKIE_REPORT_TIMEZONE),
  };
}
