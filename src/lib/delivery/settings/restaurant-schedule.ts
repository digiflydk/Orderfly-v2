import type { Location } from '@/types';
import { deliverySettingsSchema, type DeliverySettings } from './schema';

const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
/** Effective courier pickup hours. Missing mode deliberately inherits the restaurant;
 * old independent weekly rows only apply after an explicit manual selection. */
export function resolveRestaurantDeliverySchedule(input: DeliverySettings, openingHours: Location['openingHours']): DeliverySettings {
  const settings = deliverySettingsSchema.parse(input);
  if (settings.scheduleMode === 'manual') return settings;
  const weeklyHours = days.map((_, day) => ({ day, intervals: [] as {startMinute:number;endMinute:number}[] }));
  const minutes = (value: string) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw Error('invalid_restaurant_hours');
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  };
  days.forEach((name, day) => {
    const hours = openingHours?.[name];
    if (!hours?.isOpen) return;
    const open = minutes(hours.open), close = minutes(hours.close);
    if (open === close) return;
    const first = open + settings.pickupOpeningOffsetMinutes;
    const last = close + (close < open ? 1440 : 0) - settings.pickupClosingOffsetMinutes;
    if (first > last) return;
    // Schedule evaluator uses minute precision and half-open intervals. Include
    // the final pickup minute; split overnight spill into the next weekday.
    for (let offset = 0; offset <= 1; offset++) {
      const startMinute = Math.max(0, first - offset * 1440);
      const endMinute = Math.min(1440, last + 1 - offset * 1440);
      if (startMinute < endMinute) weeklyHours[(day + offset) % 7].intervals.push({startMinute, endMinute});
    }
  });
  for (const row of weeklyHours) {
    row.intervals.sort((a,b) => a.startMinute - b.startMinute);
    const merged: typeof row.intervals = [];
    for (const interval of row.intervals) {
      const previous = merged.at(-1);
      if (previous && interval.startMinute <= previous.endMinute) previous.endMinute = Math.max(previous.endMinute, interval.endMinute);
      else merged.push({...interval});
    }
    row.intervals = merged;
  }
  return deliverySettingsSchema.parse({...settings, weeklyHours});
}
