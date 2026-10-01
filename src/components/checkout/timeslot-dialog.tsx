'use client';

import { localizeTime } from '@/lib/storefront-format';
import { useState, useEffect, useMemo, useRef } from 'react';
import { toZonedTime } from 'date-fns-tz';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { resolveFulfillmentTime, fulfillmentSlots, displayFulfillmentTime, unavailableTime } from '@/lib/fulfillment-time';
import { useCart } from '@/context/cart-context';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { da } from 'date-fns/locale';

interface TimeSlotDialogProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  locationId: string;
}

export function TimeSlotDialog({ isOpen, setIsOpen, locationId }: TimeSlotDialogProps) {
  const { deliveryType, selectedTime, setSelectedTime, location } = useCart();
  const [clock, setClock] = useState(Date.now());
  const today = startOfDay(toZonedTime(new Date(clock), 'Europe/Copenhagen'));
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [month, setMonth] = useState<Date>(today);
  const [internalTime, setInternalTime] = useState(selectedTime);
  const [saveError, setSaveError] = useState(false);
  const openedScope = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) { openedScope.current = null; return; }
    if (!location || !deliveryType) return;
    const scope = `${locationId}:${deliveryType}`;
    if (openedScope.current === scope) return;
    openedScope.current = scope;
    const now = new Date();
    let date = startOfDay(toZonedTime(now, 'Europe/Copenhagen'));
    if (selectedTime !== 'asap' && Number.isFinite(Date.parse(selectedTime))) {
      date = startOfDay(toZonedTime(new Date(selectedTime), 'Europe/Copenhagen'));
      // Slots after midnight belong to the previous opening day.
      const previous = addDays(date, -1);
      if (!fulfillmentSlots(location, deliveryType, format(date, 'yyyy-MM-dd'), now).includes(selectedTime)
        && fulfillmentSlots(location, deliveryType, format(previous, 'yyyy-MM-dd'), now).includes(selectedTime)) date = previous;
    }
    setSelectedDate(date);
    setMonth(date);
    setInternalTime(selectedTime);
    setSaveError(false);
    setClock(now.getTime());
  }, [isOpen, locationId, deliveryType, location, selectedTime]);

  useEffect(() => {
    if (!isOpen) return;
    const tick = () => setClock(Date.now());
    const timer = setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, [isOpen]);

  const availableTimes = useMemo(() => location && deliveryType
    ? fulfillmentSlots(location, deliveryType, format(selectedDate, 'yyyy-MM-dd'), new Date(clock)) : [],
    [location, deliveryType, selectedDate, clock]);
  const asapInstant = useMemo(() => {
    try { return location && deliveryType ? resolveFulfillmentTime(location, deliveryType, 'asap', new Date(clock)) : null; }
    catch { return null; }
  }, [location, deliveryType, clock]);
  const canSelectAsap = isSameDay(selectedDate, today) && !!asapInstant;
  const selectionValid = internalTime === 'asap' ? canSelectAsap : availableTimes.includes(internalTime);
  const unavailableSelection = !!internalTime && !selectionValid;

  const handleDateChange = (date: Date | undefined) => {
    if (!date || isSameDay(date, selectedDate)) return;
    setSelectedDate(date);
    setInternalTime('');
    setSaveError(false);
    setClock(Date.now());
  };
  const handleSave = () => {
    try {
      if (!selectionValid || !location || !deliveryType) throw new Error(unavailableTime);
      resolveFulfillmentTime(location, deliveryType, internalTime, new Date());
      setSelectedTime(internalTime);
      setIsOpen(false);
    } catch {
      setSaveError(true);
      setClock(Date.now());
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Vælg tidspunkt</DialogTitle>
          <DialogDescription>Vælg, hvornår du vil afhente eller have leveret din ordre.</DialogDescription>
        </DialogHeader>
        <div className="p-4 space-y-4">
          <Calendar mode="single" selected={selectedDate} onSelect={handleDateChange}
            month={month} onMonthChange={setMonth}
            disabled={(date) => date < today || date > addDays(today, location?.allowPreOrder ? 7 : 0)}
            locale={da} initialFocus />
          {(unavailableSelection || saveError) && <p role="alert" className="text-sm text-destructive">{unavailableTime} Dit gemte valg ændres først, når du gemmer et nyt tidspunkt.</p>}
          <Select onValueChange={value => { setInternalTime(value); setSaveError(false); }} value={internalTime}>
            <SelectTrigger aria-label="Tidspunkt"><SelectValue placeholder="Vælg et tidspunkt" /></SelectTrigger>
            <SelectContent>
              {unavailableSelection && <SelectItem value={internalTime} disabled>{internalTime === 'asap' ? 'Hurtigst muligt' : displayFulfillmentTime(internalTime)} (ikke længere ledigt)</SelectItem>}
              {canSelectAsap && <SelectItem value="asap">Hurtigst muligt ({displayFulfillmentTime(asapInstant!)})</SelectItem>}
              {availableTimes.map(value => <SelectItem key={value} value={value}>{localizeTime(displayFulfillmentTime(value))}</SelectItem>)}
            </SelectContent>
          </Select>
          {availableTimes.length === 0 && !canSelectAsap && <p className="text-sm text-muted-foreground">Ingen ledige tider denne dag. Vælg en anden dato.</p>}
        </div>
        <DialogFooter className="p-4 border-t"><Button onClick={handleSave} disabled={!selectionValid}>Gem tidspunkt</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
