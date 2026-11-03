'use client';

import { Info, MapPin, Phone, Mail, Clock } from 'lucide-react';
import type { Brand, Location } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { locationHeaderDetails, weeklyOpeningHours } from '@/lib/location-header';

/** V2 "i": opening hours and contact details for the current restaurant. */
export function LocationInfoDialog({ brand, location }: { brand: Brand; location: Location }) {
  const { address } = locationHeaderDetails(location, new Date(0));
  const hours = weeklyOpeningHours(location);
  const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', weekday: 'long' }).format(new Date()).toLowerCase();
  const phone = location.contactPhone?.trim();
  const email = location.contactEmail?.trim() || brand.supportEmail?.trim();
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" className="v2-location-toggle" aria-label="Restaurantoplysninger"><Info className="h-5 w-5" /></button>
    </DialogTrigger>
    <DialogContent data-storefront-version="2" data-v2-location-info className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader className="text-left">
        <DialogTitle>{location.name}</DialogTitle>
        <DialogDescription>Åbningstider og kontaktoplysninger</DialogDescription>
      </DialogHeader>
      <div className="space-y-5 text-sm">
        {address && <p className="flex gap-3"><MapPin aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" />
          <a className="underline underline-offset-4" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer">{address}</a></p>}
        {hours.length > 0 && <section aria-labelledby="v2-info-hours">
          <h3 id="v2-info-hours" className="mb-2 flex items-center gap-3 font-semibold"><Clock aria-hidden="true" className="h-4 w-4" />Åbningstider</h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 pl-7">
            {hours.map(row => <div key={row.day} className="contents" data-today={row.day === today || undefined}>
              <dt className={row.day === today ? 'font-semibold' : undefined}>{row.label}</dt>
              <dd className={row.day === today ? 'text-right font-semibold' : 'text-right'}>{row.text}</dd>
            </div>)}
          </dl>
        </section>}
        {(phone || email) && <section aria-labelledby="v2-info-contact" className="space-y-2">
          <h3 id="v2-info-contact" className="font-semibold">Kontakt</h3>
          {phone && <p className="flex gap-3"><Phone aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" /><a className="underline underline-offset-4" href={`tel:${phone.replace(/[^+0-9]/g, '')}`}>{phone}</a></p>}
          {email && <p className="flex gap-3"><Mail aria-hidden="true" className="h-4 w-4 shrink-0 mt-0.5" /><a className="underline underline-offset-4 break-all" href={`mailto:${email}`}>{email}</a></p>}
        </section>}
      </div>
    </DialogContent>
  </Dialog>;
}
