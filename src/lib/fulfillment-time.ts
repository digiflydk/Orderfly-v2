import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { calculateTimeSlots } from './time-slots';
import type { Location } from '@/types';

const zone = 'Europe/Copenhagen';
export const unavailableTime = 'This order time is no longer available. Please choose a new time.';

// Values are absolute instants. Labels are presentation only, never order input.
export function fulfillmentSlots(location: Location, mode: 'pickup' | 'delivery', day: string, now = new Date()) {
  const today = toZonedTime(now, zone);
  const offset = differenceInCalendarDays(parseISO(day), parseISO(format(today, 'yyyy-MM-dd')));
  if (!location.isActive || !location.deliveryTypes?.includes(mode) || !Number.isFinite(offset) || offset < 0 || offset > 7 ||
      (offset > 0 && !location.allowPreOrder)) return [];
  const slots = calculateTimeSlots(location, `${day}T12:00:00Z`, now);
  const times = mode === 'delivery' ? slots.delivery_times : slots.pickup_times;
  const opening = location.openingHours[format(parseISO(day), 'eeee').toLowerCase()]?.open;
  return times.map(time => {
    // An opening period may finish after midnight on the following calendar day.
    const date = opening && time < opening ? format(addDays(parseISO(day), 1), 'yyyy-MM-dd') : day;
    return fromZonedTime(`${date}T${time}:00`, zone).toISOString();
  }).filter(at => new Date(at) > now);
}

export function resolveFulfillmentTime(location: Location, mode: 'pickup' | 'delivery', selection = 'asap', now = new Date()): string {
  if (!location.isActive || !location.deliveryTypes?.includes(mode)) throw new Error('This restaurant does not currently offer the selected order type.');
  const today = toZonedTime(now, zone);
  if (selection === 'asap') {
    for (let offset = 0; offset <= (location.allowPreOrder ? 7 : 0); offset++) {
      const first = fulfillmentSlots(location, mode, format(addDays(today, offset), 'yyyy-MM-dd'), now)[0];
      if (first) return first;
    }
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(selection) && Number.isFinite(Date.parse(selection))) {
    const date = toZonedTime(new Date(selection), zone);
    // Check both possible opening days for a restaurant closing after midnight.
    for (const day of [date, addDays(date, -1)]) {
      if (fulfillmentSlots(location, mode, format(day, 'yyyy-MM-dd'), now).includes(selection)) return selection;
    }
  }
  throw new Error(unavailableTime);
}

export function displayFulfillmentTime(selection: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(selection) || !Number.isFinite(Date.parse(selection))) return selection;
  return format(toZonedTime(new Date(selection), zone), 'EEE, d MMM HH:mm');
}
