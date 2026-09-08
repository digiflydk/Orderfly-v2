

import { addMinutes, format, isBefore, isEqual, roundToNearestMinutes, addDays, set, parseISO, startOfDay, isSameDay, isAfter, subMinutes } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { Location, TimeSlotResponse } from '@/types';

// This function needs to be in a client-safe file because it's imported by client components.
// We pass the location object to it instead of fetching it here.
export function calculateTimeSlots(location: Location, forDateStr?: string, currentDate = new Date()): TimeSlotResponse {
    const tidsinterval = 5;
    const timeZone = 'Europe/Copenhagen';
    const now = toZonedTime(currentDate, timeZone);
    const forDate = forDateStr ? startOfDay(toZonedTime(parseISO(forDateStr), timeZone)) : startOfDay(now);
    if (isBefore(forDate, startOfDay(now))) return { tidsinterval, pickup_times: [], delivery_times: [], asap_pickup: '', asap_delivery: '' };

    const getDayInfo = (date: Date) => {
        const dayOfWeek = format(date, 'eeee').toLowerCase() as keyof Location['openingHours'];
        const hours = location.openingHours[dayOfWeek];
        if (!hours || !hours.isOpen) return null;

        const [openHour, openMinute] = hours.open.split(':').map(Number);
        const [closeHour, closeMinute] = hours.close.split(':').map(Number);

        let openingTime = set(date, { hours: openHour, minutes: openMinute, seconds: 0, milliseconds: 0 });
        let closingTime = set(date, { hours: closeHour, minutes: closeMinute, seconds: 0, milliseconds: 0 });

        if (isBefore(closingTime, openingTime)) {
            closingTime = addDays(closingTime, 1);
        }
        
        return { openingTime, closingTime };
    };

    const generateSlots = (earliest: Date, latest: Date, minInstant?: Date): string[] => {
        if (isAfter(earliest, latest)) return [];
        const slots = [];
        let current = roundToNearestMinutes(earliest, { nearestTo: tidsinterval });
        if (isBefore(current, earliest)) {
            current = addMinutes(current, tidsinterval);
        }
        while (isBefore(current, latest) || isEqual(current, latest)) {
            const wall = format(current, "yyyy-MM-dd'T'HH:mm:ss");
            const instant = fromZonedTime(wall, timeZone);
            if (format(toZonedTime(instant, timeZone), "yyyy-MM-dd'T'HH:mm:ss") === wall && (!minInstant || instant >= minInstant)) slots.push(format(current, 'HH:mm'));
            current = addMinutes(current, tidsinterval);
        }
        return slots;
    };
    
    let effectivePrep = (location.manual_override ?? 0) > 0 
      ? (location.manual_override ?? 0)
      : (location.prep_time ?? 20);
    const deliveryMinutes = location.delivery_time ?? 20;

    if (!location.manual_override || location.manual_override === 0) {
        if (location.travlhed_factor === 'medium') effectivePrep += 10;
        if (location.travlhed_factor === 'høj') effectivePrep += 20;
    }
    
    let pickup_times: string[] = [];
    let delivery_times: string[] = [];
    let asap_pickup = '';
    let asap_delivery = '';

    const dayInfo = getDayInfo(forDate);

    if (dayInfo) {
        const { openingTime, closingTime } = dayInfo;
        const lastPossiblePickupTime = subMinutes(closingTime, effectivePrep);
        const lastPossibleDeliveryTime = subMinutes(closingTime, effectivePrep + deliveryMinutes);

        const dateIsToday = isSameDay(forDate, now);
        const isCurrentlyOpen = dateIsToday && !isBefore(now, openingTime) && isBefore(now, closingTime);
        const isBeforeOpening = dateIsToday && isBefore(now, openingTime);

        // Pickup Logic
        if (location.deliveryTypes.includes('pickup') && (!dateIsToday || isBefore(now, closingTime))) {
            const earliestPickupTime = addMinutes(isCurrentlyOpen ? now : openingTime, effectivePrep);

            if (!isAfter(earliestPickupTime, lastPossiblePickupTime)) {
                if (isCurrentlyOpen) {
                    asap_pickup = `ASAP (${effectivePrep}-${effectivePrep + 5} min)`;
                } else if (isBeforeOpening) {
                    asap_pickup = `Today - ${format(addMinutes(openingTime, effectivePrep), 'HH:mm')}`;
                } else if (!dateIsToday) {
                    asap_pickup = `${format(forDate, 'eee, MMM d')} - ${format(addMinutes(openingTime, effectivePrep), 'HH:mm')}`;
                }
                pickup_times = generateSlots(earliestPickupTime, lastPossiblePickupTime, addMinutes(isCurrentlyOpen ? currentDate : fromZonedTime(openingTime, timeZone), effectivePrep));
                if (!pickup_times.length) asap_pickup = '';
                else if (!isCurrentlyOpen) asap_pickup = `${isBeforeOpening ? 'Today' : format(forDate, 'eee, MMM d')} - ${pickup_times[0]}`;
            }
        }
        
        // Delivery Logic
        if (location.deliveryTypes.includes('delivery') && (!dateIsToday || isBefore(now, closingTime))) {
            const earliestDeliveryTime = addMinutes(isCurrentlyOpen ? now : openingTime, effectivePrep + deliveryMinutes);
            
            if (!isAfter(earliestDeliveryTime, lastPossibleDeliveryTime)) {
                if (isCurrentlyOpen) {
                    asap_delivery = `ASAP (${effectivePrep + deliveryMinutes}-${effectivePrep + deliveryMinutes + 5} min)`;
                } else if (isBeforeOpening) {
                    asap_delivery = `Today - ${format(addMinutes(openingTime, effectivePrep + deliveryMinutes), 'HH:mm')}`;
                } else if (!dateIsToday) {
                    asap_delivery = `${format(forDate, 'eee, MMM d')} - ${format(addMinutes(openingTime, effectivePrep + deliveryMinutes), 'HH:mm')}`;
                }
                delivery_times = generateSlots(earliestDeliveryTime, lastPossibleDeliveryTime, addMinutes(isCurrentlyOpen ? currentDate : fromZonedTime(openingTime, timeZone), effectivePrep + deliveryMinutes));
                if (!delivery_times.length) asap_delivery = '';
                else if (!isCurrentlyOpen) asap_delivery = `${isBeforeOpening ? 'Today' : format(forDate, 'eee, MMM d')} - ${delivery_times[0]}`;
            }
        }
    }
    
    // Handle case where restaurant is closed for the day and pre-order is allowed
    if (!forDateStr && (!asap_pickup || !asap_delivery) && location.allowPreOrder) {
        for (let i = 1; i <= 7; i++) {
            const nextDate = addDays(forDate, i);
            const nextDayInfo = getDayInfo(nextDate);
            if (nextDayInfo) {
                const label = i === 1 ? 'Tomorrow' : format(nextDate, 'eee, MMM d');
                if (!asap_pickup && location.deliveryTypes.includes('pickup') && !isAfter(addMinutes(nextDayInfo.openingTime, effectivePrep), subMinutes(nextDayInfo.closingTime, effectivePrep))) {
                    const next = generateSlots(addMinutes(nextDayInfo.openingTime, effectivePrep), subMinutes(nextDayInfo.closingTime, effectivePrep), addMinutes(fromZonedTime(nextDayInfo.openingTime, timeZone), effectivePrep));
                    if (next.length) asap_pickup = `${label} - ${next[0]}`;
                }
                if (!asap_delivery && location.deliveryTypes.includes('delivery') && !isAfter(addMinutes(nextDayInfo.openingTime, effectivePrep + deliveryMinutes), subMinutes(nextDayInfo.closingTime, effectivePrep + deliveryMinutes))) {
                    const next = generateSlots(addMinutes(nextDayInfo.openingTime, effectivePrep + deliveryMinutes), subMinutes(nextDayInfo.closingTime, effectivePrep + deliveryMinutes), addMinutes(fromZonedTime(nextDayInfo.openingTime, timeZone), effectivePrep + deliveryMinutes));
                    if (next.length) asap_delivery = `${label} - ${next[0]}`;
                }
                if ((asap_pickup || !location.deliveryTypes.includes('pickup')) && (asap_delivery || !location.deliveryTypes.includes('delivery'))) break;
            }
        }
    }

    return { tidsinterval, pickup_times, delivery_times, asap_pickup, asap_delivery };
}
