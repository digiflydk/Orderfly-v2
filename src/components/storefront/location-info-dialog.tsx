'use client';

import { Info, MapPin, Phone, Mail, Clock, Navigation } from 'lucide-react';
import type { Brand, Location } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { locationHeaderDetails, weeklyOpeningHours } from '@/lib/location-header';

function copenhagenNow(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return { day: get('weekday').toLowerCase(), time: `${get('hour')}:${get('minute')}` };
}

/** "Åben nu" / "Lukket nu" from today's configured hours (same-day ranges; past-midnight closing counts as open until then). */
function openState(location: Location, now: Date): { open: boolean; text: string } | null {
  const { day, time } = copenhagenNow(now);
  const hours = location.openingHours?.[day];
  if (!hours) return null;
  if (!hours.isOpen || !hours.open || !hours.close) return { open: false, text: 'Lukket i dag' };
  const closesAfterMidnight = hours.close <= hours.open;
  const open = time >= hours.open && (closesAfterMidnight || time < hours.close);
  if (open) return { open: true, text: `Åben nu · lukker kl. ${hours.close}` };
  return { open: false, text: time < hours.open ? `Lukket nu · åbner kl. ${hours.open}` : 'Lukket for i dag' };
}

/** V2 "i": opening hours and contact details for the current restaurant, styled as the storefront's dark cards. */
export function LocationInfoDialog({ brand, location }: { brand: Brand; location: Location }) {
  return <Dialog>
    <DialogTrigger asChild>
      <button type="button" className="v2-location-toggle" aria-label="Restaurantoplysninger"><Info className="h-5 w-5" /></button>
    </DialogTrigger>
    <DialogContent data-storefront-version="2" data-v2-location-info className="v2-info-sheet">
      <LocationInfoContent brand={brand} location={location} />
    </DialogContent>
  </Dialog>;
}

function LocationInfoContent({ brand, location }: { brand: Brand; location: Location }) {
  const now = new Date();
  const { address } = locationHeaderDetails(location, now);
  const hours = weeklyOpeningHours(location);
  const today = copenhagenNow(now).day;
  const state = openState(location, now);
  const phone = location.contactPhone?.trim();
  const email = location.contactEmail?.trim() || brand.supportEmail?.trim();
  const maps = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
  return <>
    <DialogHeader className="v2-info-header">
      <DialogTitle>{location.name}</DialogTitle>
      <DialogDescription className="sr-only">Åbningstider og kontaktoplysninger</DialogDescription>
      {state && <p className="v2-info-state" data-open={state.open || undefined}><span aria-hidden="true" />{state.text}</p>}
    </DialogHeader>
    <div className="v2-info-body">
      {address && <section className="v2-info-card" aria-labelledby="v2-info-address">
        <h3 id="v2-info-address"><MapPin aria-hidden="true" />Adresse</h3>
        <p>{address}</p>
        {maps && <a className="v2-info-action" href={maps} target="_blank" rel="noopener noreferrer"><Navigation aria-hidden="true" />Vis rute</a>}
      </section>}
      {hours.length > 0 && <section className="v2-info-card" aria-labelledby="v2-info-hours">
        <h3 id="v2-info-hours"><Clock aria-hidden="true" />Åbningstider</h3>
        <dl className="v2-info-hours">
          {hours.map(row => <div key={row.day} data-today={row.day === today || undefined}>
            <dt>{row.label}{row.day === today && <span className="v2-info-today">I dag</span>}</dt>
            <dd>{row.text}</dd>
          </div>)}
        </dl>
      </section>}
      {(phone || email) && <section className="v2-info-card" aria-labelledby="v2-info-contact">
        <h3 id="v2-info-contact"><Phone aria-hidden="true" />Kontakt</h3>
        <div className="v2-info-contact">
          {phone && <a className="v2-info-action" href={`tel:${phone.replace(/[^+0-9]/g, '')}`}><Phone aria-hidden="true" />{phone}</a>}
          {email && <a className="v2-info-action" href={`mailto:${email}`}><Mail aria-hidden="true" /><span className="break-all">{email}</span></a>}
        </div>
      </section>}
    </div>
  </>;
}
