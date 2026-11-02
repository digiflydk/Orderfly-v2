import type { Location } from '@/types';

export function locationHeaderDetails(location: Location, now: Date) {
  const streetAddress = [location.street?.trim(), [location.zipCode, location.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const address = location.street?.trim() ? streetAddress : location.address?.trim() || streetAddress;
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', weekday: 'long' }).format(now).toLowerCase();
  const hours = location.openingHours?.[day];
  const opening = !hours ? null : !hours.isOpen ? 'Lukket' : hours.open && hours.close ? `${hours.open}–${hours.close}` : null;
  const delivery = location.deliveryTypes?.includes('delivery') || location.supportsDelivery === true;
  return { address, opening, delivery };
}

const WEEK: [string, string][] = [['monday','Mandag'],['tuesday','Tirsdag'],['wednesday','Onsdag'],['thursday','Torsdag'],['friday','Fredag'],['saturday','Lørdag'],['sunday','Søndag']];

/** Monday–Sunday opening hours for the storefront info popup. Days without data are omitted. */
export function weeklyOpeningHours(location: Location): { day: string; label: string; text: string }[] {
  return WEEK.flatMap(([day, label]) => {
    const hours = location.openingHours?.[day];
    if (!hours) return [];
    const text = !hours.isOpen ? 'Lukket' : hours.open && hours.close ? `${hours.open}–${hours.close}` : null;
    return text ? [{ day, label, text }] : [];
  });
}
