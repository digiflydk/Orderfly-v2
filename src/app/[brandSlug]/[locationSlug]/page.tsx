
import { notFound } from 'next/navigation';
import { MenuClient } from "./menu-client";
import { getCategoriesForLocation } from "@/app/superadmin/categories/actions";
import { getActiveCombosForLocation } from '@/app/superadmin/combos/actions';
import { getProductsForLocation } from '@/app/superadmin/products/actions';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import { HeroBanner } from '@/components/layout/hero-banner';
import type { ProductForMenu, Location, Brand } from '@/types';
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";

export default async function MenuPage({ params }: { params: { brandSlug: string; locationSlug: string } }) {
  const { brandSlug, locationSlug } = params as { brandSlug: string; locationSlug: string };
  const probe = await getBrandAndLocation(brandSlug, locationSlug);

  if (!probe.brand || !probe.location) {
    return (
      <EmptyState
        title="Ingen data for denne butik endnu"
        hint={`Mangler ${
          !probe.brand && !probe.location
            ? "brand og location"
            : !probe.brand
            ? "brand"
            : "location"
        }. Tjek /api/diag/brand-location?brandSlug=${brandSlug}&locationSlug=${locationSlug}`}
      />
    );
  }

  if (!probe.brandMatchesLocation) {
    return (
      <EmptyState
        title="Butik er ikke linket korrekt"
        hint={`location.brandId skal være ${probe.brand.id}. Tjek /api/diag/brand-location?brandSlug=${brandSlug}&locationSlug=${locationSlug}`}
      />
    );
  }

  const brand = probe.brand as Brand;
  const location = probe.location as Location;
  
  // Validate smileyUrl server-side
  const rawUrl = (location.smileyUrl || '').trim();
  const isValid = /^https?:\/\//i.test(rawUrl);
  const finalLocation: Location = {
      ...location,
      smileyUrl: isValid ? rawUrl : undefined,
  };


  // Fetch all necessary data on the server
  const [categories, activeCombos, allProductsForLocation, activeStandardDiscounts] = await Promise.all([
    getCategoriesForLocation(location.id),
    getActiveCombosForLocation(location.id),
    getProductsForLocation(location.id),
    getActiveStandardDiscounts({ brandId: brand.id, locationId: location.id, deliveryType: 'delivery' }), // Fetch initial discounts
  ]);
  
  // Create a placeholder for the "Offers" category if needed later on the client.
  const offerCategoryPlaceholder = {
      id: 'offers',
      categoryName: brand.offersHeading || 'Offers',
      locationIds: [location.id],
      isActive: true,
      sortOrder: -1,
      brandId: brand.id,
  };

  const finalCategories = [offerCategoryPlaceholder, ...categories].sort((a,b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

  return (
    <>
      <div className="space-y-6 pt-6">
        <HeroBanner location={finalLocation} />
        
        <MenuClient 
            brand={brand}
            location={finalLocation}
            initialCategories={finalCategories}
            initialProducts={allProductsForLocation as ProductForMenu[]} // Pass all products to client
            initialActiveCombos={activeCombos}
            initialActiveStandardDiscounts={activeStandardDiscounts} // Pass initial discounts
        />
      </div>
    </>
  );
}
