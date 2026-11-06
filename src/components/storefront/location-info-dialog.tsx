'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Info } from 'lucide-react';
import type { Brand, Location } from '@/types';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const LocationInfoContent = dynamic(() => import('./location-info-content'), {
  loading: () => <><DialogTitle>Restaurantoplysninger</DialogTitle><p role="status">Indlæser…</p></>,
});

/** Keep the trigger available in HTML; fetch detailed content only after opening. */
export function LocationInfoDialog({ brand, location }: { brand: Brand; location: Location }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild>
      <button type="button" className="v2-location-toggle" aria-label="Restaurantoplysninger"><Info className="h-5 w-5" /></button>
    </DialogTrigger>
    {open && <DialogContent data-storefront-version="2" data-v2-location-info className="v2-info-sheet">
      <LocationInfoContent brand={brand} location={location} />
    </DialogContent>}
  </Dialog>;
}
