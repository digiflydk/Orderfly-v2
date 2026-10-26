import { deliverySettingsSchema, type DeliverySettings } from './schema';

/** Time ranges are half-open local wall-clock ranges. Split overnight hours across two dates. */
export function deliveryScheduleAt(input: DeliverySettings, instant: Date): { open: boolean; reason: 'open' | 'disabled' | 'paused' | 'closed'; localDate: string } {
  const settings = deliverySettingsSchema.parse(input);
  if (!Number.isFinite(instant.getTime())) throw new Error('invalid_delivery_time');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const localDate = `${part('year')}-${part('month')}-${part('day')}`;
  if (!settings.enabled) return { open: false, reason: 'disabled', localDate };
  if (settings.paused) return { open: false, reason: 'paused', localDate };
  const day = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  const ranges = settings.exceptions.find(exception => exception.date === localDate)?.intervals ?? settings.weeklyHours.find(entry => entry.day === day)!.intervals;
  const minute = Number(part('hour')) * 60 + Number(part('minute'));
  const open = ranges.some(range => minute >= range.startMinute && minute < range.endMinute);
  return { open, reason: open ? 'open' : 'closed', localDate };
}
