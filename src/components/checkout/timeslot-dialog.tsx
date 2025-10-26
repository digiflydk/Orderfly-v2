

'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { getTimeSlots } from '@/app/superadmin/locations/actions';
import { useCart } from '@/context/cart-context';
import { format, addDays, isToday, startOfDay, isSameDay } from 'date-fns';
import { Loader2, X } from 'lucide-react';
import { DialogClose } from '@radix-ui/react-dialog';
import type { TimeSlotResponse } from '@/types';

interface TimeSlotDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  locationId: string;
}

export function TimeSlotDialog({ isOpen, setIsOpen, locationId }: TimeSlotDialogProps) {
  const { deliveryType, selectedTime, setSelectedTime } = useCart();
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [timeSlots, setTimeSlots] = useState<TimeSlotResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [internalTime, setInternalTime] = useState(selectedTime);

  useEffect(() => {
    if (isOpen) {
      handleDateChange(startOfDay(new Date()));
    }
  }, [isOpen]);

  const handleDateChange = async (date: Date | undefined) => {
    if (!date) return;
    setIsLoading(true);
    setSelectedDate(date);
    const slots = await getTimeSlots(locationId, date.toISOString());
    setTimeSlots(slots);
    setIsLoading(false);
    // Reset time selection if new date has no slots or new date is chosen
    setInternalTime('asap');
  };

  const availableTimes = timeSlots ? (deliveryType === 'delivery' ? timeSlots.delivery_times : timeSlots.pickup_times) : [];
  
  const asapText = useMemo(() => {
      if (!timeSlots) return 'Loading...';
      const text = deliveryType === 'delivery' ? timeSlots.asap_delivery : timeSlots.asap_pickup;
      if (text) return text;
      return 'No times available';
  }, [timeSlots, deliveryType]);
  
  const handleSave = () => {
    setSelectedTime(internalTime);
    setIsOpen(false);
  }
  
  const formatTimeForDisplay = (time: string, date: Date) => {
    const today = new Date();
    if (isToday(date)) return `Today at ${time}`;
    if (isSameDay(date, addDays(today, 1))) return `Tomorrow at ${time}`;
    return `${format(date, 'eee, MMM d')} at ${time}`;
  }


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
                disabled={(date) => date < startOfDay(new Date()) || date > addDays(new Date(), 7)}
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
                        {isToday(selectedDate) && <SelectItem value="asap">{asapText}</SelectItem>}
                        {availableTimes.map(time => {
                            const displayValue = formatTimeForDisplay(time, selectedDate);
                            return (
                                <SelectItem key={displayValue} value={displayValue}>
                                    {displayValue}
                                </SelectItem>
                            )
                        })}
                    </SelectContent>
                </Select>
            )}
        </div>
        
        <DialogFooter className="p-4 border-t">
          <Button onClick={handleSave} disabled={isLoading || (availableTimes.length === 0 && !asapText.startsWith('ASAP'))}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
