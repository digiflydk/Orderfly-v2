import { addDays, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Location } from '@/types';
import { deliveryPreparationMinutes, fulfillmentSlots, managedDeliverySelection, resolveFulfillmentTime, unavailableTime } from '@/lib/fulfillment-time';
import { defaultDeliverySettings, type DeliverySettings } from './settings/schema';
import { deliveryScheduleAt } from './settings/schedule';

/** Public availability only. Provider bindings, pricing and credentials never reach the client. */
export type ManagedDeliverySchedule = Pick<DeliverySettings, 'enabled' | 'paused' | 'timezone' | 'weeklyHours' | 'exceptions' | 'preparationMinutes'>;
const zone = 'Europe/Copenhagen';

function preparedLocation(location: Location, schedule: ManagedDeliverySchedule): Location {
  const preparation = deliveryPreparationMinutes(location, schedule.preparationMinutes);
  return { ...location, prep_time: preparation, manual_override: preparation, travlhed_factor: 'normal' };
}

/** Intersect native kitchen slots with the very same delivery schedule used by quoting. */
export function managedFulfillmentSlots(location: Location, mode: 'pickup' | 'delivery', day: string, now = new Date(), schedule?: ManagedDeliverySchedule | null): string[] {
  if (mode === 'pickup' || !schedule) return fulfillmentSlots(location, mode, day, now);
  try {
    const settings = { ...defaultDeliverySettings(), ...schedule };
    return fulfillmentSlots(preparedLocation(location, schedule), mode, day, now)
      .filter(at => deliveryScheduleAt(settings, new Date(at)).open);
  } catch { return []; }
}

/** No fallback to kitchen-only hours when a managed schedule has no available slots. */
export function resolveManagedFulfillmentTime(location: Location, mode: 'pickup' | 'delivery', selection = 'asap', now = new Date(), schedule?: ManagedDeliverySchedule | null): string {
  if (mode === 'pickup' || !schedule) return resolveFulfillmentTime(location, mode, selection, now);
  if (selection === 'asap') {
    const today = toZonedTime(now, zone);
    for (let offset = 0; offset <= (location.allowPreOrder ? 7 : 0); offset++) {
      const first = managedFulfillmentSlots(location, mode, format(addDays(today, offset), 'yyyy-MM-dd'), now, schedule)[0];
      if (first) return first;
    }
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(selection) && Number.isFinite(Date.parse(selection))) {
    const date = toZonedTime(new Date(selection), zone);
    for (const day of [date, addDays(date, -1)]) {
      if (managedFulfillmentSlots(location, mode, format(day, 'yyyy-MM-dd'), now, schedule).includes(selection)) return selection;
    }
  }
  throw new Error(unavailableTime);
}

/** Courier ASAP means now; a later delivery opening must be submitted explicitly. */
export function managedDeliverySelectionForSchedule(location: Location, selection: string, now = new Date(), schedule?: ManagedDeliverySchedule | null): string {
  if (!schedule) return managedDeliverySelection(location, selection, now);
  const next = resolveManagedFulfillmentTime(location, 'delivery', selection, now, schedule);
  if (selection !== 'asap') return next;
  const native = managedDeliverySelection(location, selection, now);
  const settings = { ...defaultDeliverySettings(), ...schedule };
  if (native !== 'asap' || !deliveryScheduleAt(settings, now).open) return next;
  const earliest = resolveFulfillmentTime(preparedLocation(location, schedule), 'delivery', 'asap', now);
  return earliest === next ? 'asap' : next;
}

export function unavailableManagedDeliverySchedule(): ManagedDeliverySchedule {
  const { enabled, paused, timezone, weeklyHours, exceptions, preparationMinutes } = defaultDeliverySettings();
  return { enabled, paused, timezone, weeklyHours, exceptions, preparationMinutes };
}
