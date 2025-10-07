
import { notFound } from 'next/navigation';
import { MenuClient } from "./menu-client";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { getLocationBySlug } from "@/app/superadmin/locations/actions";
import { getCategoriesForLocation } from "@/app/superadmin/categories/actions";
import { getActiveCombosForLocation } from '@/app/superadmin/combos/actions';
import { getProductsForLocation } from '@/app/superadmin/products/actions';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import { HeroBanner } from '@/components/layout/hero-banner';
import type { ProductForMenu, Location } from '@/types';

export const runtime = "nodejs";

export default async function BrandLocationPage(props: any) {
  // Læs params defensivt uden at binde til Next’s genererede typer
  const params = (props && typeof props === "object" ? (props as any).params : undefined) || {};
  const brandSlug = typeof params.brandSlug === "string" ? params.brandSlug : undefined;
  const locationSlug = typeof params.locationSlug === "string" ? params.locationSlug : undefined;

  if (!brandSlug || !locationSlug) {
    notFound();
  }

  const brand = await getBrandBySlug(brandSlug);
  if (!brand) {
    notFound();
  }

  const fetchedLocation = await getLocationBySlug(brand.id, locationSlug);
  if (!fetchedLocation) {
    notFound();
  }
  
  // Validate smileyUrl server-side
  const rawUrl = (fetchedLocation.smileyUrl || '').trim();
  const isValid = /^https?:\/\//i.test(rawUrl);
  const location: Location = {
      ...fetchedLocation,
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
        <HeroBanner location={location} />
        
        <MenuClient 
            brand={brand}
            location={location}
            initialCategories={finalCategories}
            initialProducts={allProductsForLocation as ProductForMenu[]} // Pass all products to client
            initialActiveCombos={activeCombos}
            initialActiveStandardDiscounts={activeStandardDiscounts} // Pass initial discounts
        />
      </div>
    </>
  );
}
