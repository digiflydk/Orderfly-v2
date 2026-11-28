import { addDays, addMinutes, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import type { Location } from '@/types';
import { deliveryKitchenOpenAt, deliveryPreparationMinutes, fulfillmentSlots, managedDeliverySelection, resolveFulfillmentTime, unavailableTime } from '@/lib/fulfillment-time';
import { defaultDeliverySettings, type DeliverySettings } from './settings/schema';
import { deliveryScheduleAt } from './settings/schedule';
import { resolveRestaurantDeliverySchedule } from './settings/restaurant-schedule';
import { WOLT_SCHEDULED_MAX_LEAD_MINUTES, WOLT_SCHEDULED_MIN_LEAD_MINUTES } from './providers/wolt/schedule-limits';

/** Provider limits for a scheduled (non-ASAP) customer arrival, counted from now. Public: no binding or credential. */
export type ManagedScheduledLead = { minMinutes: number; maxMinutes: number };
/** Public availability only. Provider bindings, pricing and credentials never reach the client. */
export type ManagedDeliverySchedule = Pick<DeliverySettings, 'enabled' | 'paused' | 'timezone' | 'weeklyHours' | 'exceptions' | 'preparationMinutes' | 'scheduleMode' | 'pickupOpeningOffsetMinutes' | 'pickupClosingOffsetMinutes'> & { scheduledLead?: ManagedScheduledLead | null };
const zone = 'Europe/Copenhagen';
export const MANAGED_DELIVERY_TRANSPORT_MINUTES = 30;

function preparedLocation(location: Location, schedule: ManagedDeliverySchedule): Location {
  const preparation = deliveryPreparationMinutes(location, schedule.preparationMinutes);
  return { ...location, deliveryTypes: ['pickup'], delivery_time: MANAGED_DELIVERY_TRANSPORT_MINUTES, prep_time: preparation, manual_override: preparation, travlhed_factor: 'normal' };
}

/** Margin when offering a slot: covers quoting, payment and the clock moving while the customer decides. */
export const MANAGED_SCHEDULED_OFFER_MARGIN_MINUTES = 15;
/** Smaller margin when accepting an already offered slot, so a slot picked a few minutes ago stays valid. */
export const MANAGED_SCHEDULED_ACCEPT_MARGIN_MINUTES = 5;

/** Scheduled-arrival limits for the configured provider; only Wolt Drive has them today. */
export function managedScheduledLead(providerId: string | null | undefined): ManagedScheduledLead | null {
  return providerId === 'wolt' ? { minMinutes: WOLT_SCHEDULED_MIN_LEAD_MINUTES, maxMinutes: WOLT_SCHEDULED_MAX_LEAD_MINUTES } : null;
}
function leadOf(schedule: ManagedDeliverySchedule): ManagedScheduledLead | null {
  if (schedule.scheduledLead) return schedule.scheduledLead;
  // Server callers pass full settings; derive from the provider so validation never depends on the client projection.
  const providerId = (schedule as { providerId?: unknown }).providerId;
  return typeof providerId === 'string' ? managedScheduledLead(providerId) : null;
}
function withinLead(at: string, now: Date, lead: ManagedScheduledLead | null, marginMinutes: number): boolean {
  if (!lead) return true;
  const delta = Date.parse(at) - now.getTime();
  return delta >= (lead.minMinutes + marginMinutes) * 60_000 && delta <= (lead.maxMinutes - marginMinutes) * 60_000;
}
const scheduledLeadError = 'unsupported_schedule';

/** Kitchen and delivery-schedule slots before any provider lead limit. */
function rawManagedSlots(location: Location, day: string, now: Date, schedule: ManagedDeliverySchedule): string[] {
  try {
    if (!location.isActive || !location.deliveryTypes?.includes('delivery')) return [];
    // The settings schema is strict: the public lead projection is not a stored setting.
    const { scheduledLead: _lead, ...stored } = schedule;
    const settings = resolveRestaurantDeliverySchedule({ ...defaultDeliverySettings(), ...stored }, location.openingHours);
    return fulfillmentSlots(preparedLocation(location, schedule), 'pickup', day, now)
      .filter(at => deliveryScheduleAt(settings, new Date(at)).open)
      .map(at => addMinutes(new Date(at), MANAGED_DELIVERY_TRANSPORT_MINUTES).toISOString());
  } catch { return []; }
}
function firstRawSlot(location: Location, now: Date, schedule: ManagedDeliverySchedule, accept: (at: string) => boolean = () => true): string | null {
  const today = toZonedTime(now, zone);
  for (let offset = 0; offset <= (location.allowPreOrder ? 7 : 0); offset++) {
    const first = rawManagedSlots(location, format(addDays(today, offset), 'yyyy-MM-dd'), now, schedule).find(accept);
    if (first) return first;
  }
  return null;
}
/** True when ASAP means "courier now" (no scheduled drop-off is sent to the provider). */
function courierAsap(location: Location, now: Date, schedule: ManagedDeliverySchedule): boolean {
  if (!deliveryKitchenOpenAt(location, now)) return false;
  try {
    const ready = resolveFulfillmentTime(preparedLocation(location, schedule), 'pickup', 'asap', now);
    return addMinutes(new Date(ready), MANAGED_DELIVERY_TRANSPORT_MINUTES).toISOString() === firstRawSlot(location, now, schedule);
  } catch { return false; }
}

/** Intersect native kitchen slots with the very same delivery schedule used by quoting.
 * Offered slots are scheduled arrivals, so they also respect the provider lead (Wolt: 60 min – 7 days) plus a margin. */
export function managedFulfillmentSlots(location: Location, mode: 'pickup' | 'delivery', day: string, now = new Date(), schedule?: ManagedDeliverySchedule | null): string[] {
  if (mode === 'pickup' || !schedule) return fulfillmentSlots(location, mode, day, now);
  const lead = leadOf(schedule);
  return rawManagedSlots(location, day, now, schedule).filter(at => withinLead(at, now, lead, MANAGED_SCHEDULED_OFFER_MARGIN_MINUTES));
}

/** No fallback to kitchen-only hours when a managed schedule has no available slots. */
export function resolveManagedFulfillmentTime(location: Location, mode: 'pickup' | 'delivery', selection = 'asap', now = new Date(), schedule?: ManagedDeliverySchedule | null): string {
  if (mode === 'pickup' || !schedule) return resolveFulfillmentTime(location, mode, selection, now);
  const lead = leadOf(schedule);
  if (selection === 'asap') {
    // Courier-now ASAP is not a scheduled drop-off; any later opening is, and must respect the provider lead.
    const first = courierAsap(location, now, schedule) ? firstRawSlot(location, now, schedule)
      : firstRawSlot(location, now, schedule, at => withinLead(at, now, lead, MANAGED_SCHEDULED_OFFER_MARGIN_MINUTES));
    if (first) return first;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(selection) && Number.isFinite(Date.parse(selection))) {
    const date = toZonedTime(new Date(selection), zone);
    for (const day of [date, addDays(date, -1)]) {
      if (rawManagedSlots(location, format(day, 'yyyy-MM-dd'), now, schedule).includes(selection)) {
        if (!withinLead(selection, now, lead, MANAGED_SCHEDULED_ACCEPT_MARGIN_MINUTES)) throw new Error(scheduledLeadError);
        return selection;
      }
    }
  }
  throw new Error(unavailableTime);
}

/** Courier ASAP means now; a later delivery opening must be submitted explicitly. */
export function managedDeliverySelectionForSchedule(location: Location, selection: string, now = new Date(), schedule?: ManagedDeliverySchedule | null): string {
  if (!schedule) return managedDeliverySelection(location, selection, now);
  const next = resolveManagedFulfillmentTime(location, 'delivery', selection, now, schedule);
  if (selection !== 'asap') return next;
  return courierAsap(location, now, schedule) ? 'asap' : next;
}

export function unavailableManagedDeliverySchedule(): ManagedDeliverySchedule {
  const { enabled, paused, timezone, weeklyHours, exceptions, preparationMinutes, scheduleMode, pickupOpeningOffsetMinutes, pickupClosingOffsetMinutes } = defaultDeliverySettings();
  return { enabled, paused, timezone, weeklyHours, exceptions, preparationMinutes, scheduleMode, pickupOpeningOffsetMinutes, pickupClosingOffsetMinutes, scheduledLead: null };
}
