import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { promotionDate } from './promotion-date';

const zone = 'Europe/Copenhagen';
/** Persisted instants are displayed as restaurant calendar days, never browser UTC slices. */
export function promotionDay(value: unknown): string | undefined {
  const date = promotionDate(value);
  return date ? formatInTimeZone(date, zone, 'yyyy-MM-dd') : undefined;
}
/** A date picker Date represents a calendar selection in the browser's own zone. */
export function calendarDay(value: Date | undefined): string | undefined {
  if (!value) return undefined;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function calendarDate(day: string | undefined): Date | undefined {
  if (!day) return undefined;
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12);
}
export function promotionBoundary(day: string, end = false): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Vælg en gyldig kalenderdato.');
  const result = fromZonedTime(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}`, zone);
  if (!Number.isFinite(result.getTime()) || promotionDay(result) !== day) throw new Error('Vælg en gyldig kalenderdato.');
  return result;
}
/** Unchanged legacy dates keep their exact instant; no implicit historical migration. */
export function savedPromotionDate(day: string, previous: unknown, end = false): Date {
  const old = promotionDate(previous);
  return old && promotionDay(old) === day ? old : promotionBoundary(day, end);
}
