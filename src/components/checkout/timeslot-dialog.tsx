

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { resolveFulfillmentTime, fulfillmentSlots } from '@/lib/fulfillment-time';
import { getTimeSlots } from '@/app/superadmin/locations/actions';
import { useCart } from '@/context/cart-context';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { Loader2 } from 'lucide-react';
import type { TimeSlotResponse } from '@/types';

interface TimeSlotDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  locationId: string;
}

export function TimeSlotDialog({ isOpen, setIsOpen, locationId }: TimeSlotDialogProps) {
  const { deliveryType, selectedTime, setSelectedTime, location } = useCart();
  const today = startOfDay(toZonedTime(new Date(), 'Europe/Copenhagen'));
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [timeSlots, setTimeSlots] = useState<TimeSlotResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [internalTime, setInternalTime] = useState(selectedTime);
  const requestId = useRef(0);
  const [clock, setClock] = useState(new Date().getTime());
  useEffect(() => {
    if (!isOpen) return;
    const tick = () => setClock(Date.now());
    const timer = setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, [isOpen]);
  const slotValue = (time: string) => {
    const opening = location?.openingHours[format(selectedDate, 'eeee').toLowerCase()]?.open;
    const day = opening && time < opening ? addDays(selectedDate, 1) : selectedDate;
    return fromZonedTime(`${format(day, 'yyyy-MM-dd')}T${time}:00`, 'Europe/Copenhagen').toISOString();
  };
  const stillAvailable = (value: string) => {
    try { if (!location || !deliveryType) return false; resolveFulfillmentTime(location, deliveryType, value, new Date()); return true; }
    catch { return false; }
  };

  useEffect(() => {
    if (isOpen) {
      handleDateChange(today);
    }
    return () => { requestId.current++; };
  }, [isOpen, locationId]);

  const handleDateChange = async (date: Date | undefined) => {
    if (!date) return;
    const request = ++requestId.current;
    setIsLoading(true);
    setSelectedDate(date);
    setTimeSlots(null);
    setInternalTime('');
    try {
      // Send the selected calendar day, independent of the shopper's timezone.
      const slots = await getTimeSlots(locationId, `${format(date, 'yyyy-MM-dd')}T12:00:00Z`);
      if (request === requestId.current) setTimeSlots(slots);
    } catch {
      if (request === requestId.current) setTimeSlots(null);
    } finally {
      if (request === requestId.current) setIsLoading(false);
    }
  };

  const validInstants = useMemo(() => new Set(location && deliveryType
    ? fulfillmentSlots(location, deliveryType, format(selectedDate, 'yyyy-MM-dd'), new Date(clock)) : []),
    [location, deliveryType, selectedDate, clock]);
  const availableTimes = (timeSlots ? (deliveryType === 'delivery' ? timeSlots.delivery_times : timeSlots.pickup_times) : []).filter(time => validInstants.has(slotValue(time)));

  const asapText = useMemo(() => {
      if (!timeSlots) return 'Loading...';
      const text = deliveryType === 'delivery' ? timeSlots.asap_delivery : timeSlots.asap_pickup;
      if (text) return text;
      return 'No times available';
  }, [timeSlots, deliveryType]);

  const handleSave = () => {
    if (!selectionValid || !stillAvailable(internalTime)) { setInternalTime(''); setClock(Date.now()); return; }
    setSelectedTime(internalTime);
    setIsOpen(false);
  }

  const formatTimeForDisplay = (time: string, date: Date) => {
    if (isSameDay(date, today)) return `Today at ${time}`;
    if (isSameDay(date, addDays(today, 1))) return `Tomorrow at ${time}`;
    return `${format(date, 'eee, MMM d')} at ${time}`;
  }
  const canSelectAsap = isSameDay(selectedDate, today) && availableTimes.length > 0 && !!(deliveryType === 'delivery' ? timeSlots?.asap_delivery : timeSlots?.asap_pickup);
  const selectionValid = !isLoading && (internalTime === 'asap' ? canSelectAsap : availableTimes.some(time => slotValue(time) === internalTime));


  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Choose Time</DialogTitle>
          <DialogDescription>Select your desired pickup or delivery time.</DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-4">
            <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateChange}
                disabled={(date) => date < today || date > addDays(today, 7)}
                initialFocus
            />

            {isLoading ? (
                <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                 <Select onValueChange={setInternalTime} value={internalTime}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a time" />
                    </SelectTrigger>
                    <SelectContent>
                        {canSelectAsap && <SelectItem value="asap">{asapText}</SelectItem>}
                        {availableTimes.map(time => {
                            const displayValue = formatTimeForDisplay(time, selectedDate);
                            return (
                                <SelectItem key={slotValue(time)} value={slotValue(time)}>
                                    {displayValue}
                                </SelectItem>
                            )
                        })}
                    </SelectContent>
                </Select>
            )}
        </div>

        <DialogFooter className="p-4 border-t">
          <Button onClick={handleSave} disabled={!selectionValid}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
