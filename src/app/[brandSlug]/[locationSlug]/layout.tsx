import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getBrandAndLocation } from '@/lib/data/brand-location';
import { MenuHeader } from '@/components/layout/menu-header';
import { DeliveryPriceProvider } from '@/context/delivery-price-context';
import { managedDeliveryRequired } from '@/lib/delivery/quotes/adoption';
import { readPublicManagedDeliverySchedule } from '@/lib/delivery/public-schedule-server';

export default async function LocationLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ brandSlug: string; locationSlug: string }>;
}) {
  const { brandSlug, locationSlug } = await params;
  const { brand, location, brandMatchesLocation } = await getBrandAndLocation(brandSlug, locationSlug);
  if (!brand || !location || !brandMatchesLocation) notFound();

  const managed = await managedDeliveryRequired({ brandId: brand.id, locationId: location.id });
  const schedule = managed ? await readPublicManagedDeliverySchedule({ brandId: brand.id, locationId: location.id }) : null;
  return <DeliveryPriceProvider managed={managed} schedule={schedule}>
    <MenuHeader brand={brand} initialLocation={location} initialNow={Date.now()} />
    <main>{children}</main>
  </DeliveryPriceProvider>;
}
