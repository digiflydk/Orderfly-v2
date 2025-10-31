
'use server';

// src/app/[brandSlug]/[locationSlug]/page.tsx

import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import EmptyState from "@/components/ui/empty-state";
import BrandPageClient from "./BrandPageClient";
import { getMenuForRender } from "@/lib/server/catalog";
import { getActiveStandardDiscounts } from "@/app/superadmin/standard-discounts/actions";
import { getActiveCombosForLocation } from "@/app/superadmin/combos/actions";

export const runtime = "nodejs";
export const revalidate = 0; // Or a specific time in seconds

export default async function LocationPage({ params }: AsyncPageProps<{ brandSlug: string; locationSlug: string }>) {
  const { brandSlug, locationSlug } = await resolveParams(params);

  const { brand, location } = await getBrandAndLocation(brandSlug, locationSlug);

  if (!brand || !location) {
    return (
      <EmptyState
        title="Location Not Found"
        hint="The requested brand or location could not be found."
        details={`Brand: ${brandSlug}, Location: ${locationSlug}`}
      />
    );
  }

  // Fetch all necessary data for the menu on the server
  const [
    menuData,
    activeCombos,
    activeStandardDiscounts,
  ] = await Promise.all([
    getMenuForRender({ brandId: brand.id, locationId: location.id }),
    getActiveCombosForLocation(location.id),
    getActiveStandardDiscounts({ brandId: brand.id, locationId: location.id, deliveryType: 'pickup' }), // Default to pickup, client will refetch on change
  ]);

  return (
    <BrandPageClient
      brand={brand}
      location={location}
      menu={menuData}
      activeCombos={activeCombos}
      activeStandardDiscounts={activeStandardDiscounts}
    />
  );
}
