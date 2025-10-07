

// src/app/[brandSlug]/page.tsx
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { Suspense } from "react";
import { LocationCard } from "@/components/location-card";
import type { Brand, Location } from "@/types";
import { getBrandBySlug } from "@/app/superadmin/brands/actions";
import { getLocationsForBrand } from "@/app/superadmin/locations/actions";
import { notFound } from "next/navigation";
import { BrandLayoutClient } from "@/app/[brandSlug]/layout-client";

interface BrandPageData {
  brand: Brand;
  locations: Location[];
}

function BrandPageComponent({ brand, locations }: BrandPageData) {
  const locationsWithBrandSlug = locations.map(location => ({...location, brandSlug: brand.slug}));
  
  return (
    <BrandLayoutClient brand={brand}>
        <div className="mx-auto max-w-[1140px] px-4 py-8 w-full">
        <div className="space-y-8">
            <div>
            <h1 className="text-3xl font-bold text-center sm:text-left">
                Choose restaurant
            </h1>
            <p className="text-lg text-muted-foreground text-center sm:text-left">
                Next you choose food and drinks that you can order for pick-up or delivery.
            </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {locationsWithBrandSlug.map((location) => (
                <LocationCard key={location.id} location={location} />
            ))}
            </div>
        </div>
        </div>
    </BrandLayoutClient>
  );
}

export async function generateMetadata({ params }: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  return { title: `Brand • ${routeParams.brandSlug}` };
}

export default async function BrandPage({ params, searchParams }: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);
  const { brandSlug } = routeParams;

  const brand = await getBrandBySlug(brandSlug);

  if (!brand) {
    notFound();
  }

  const locationsData = await getLocationsForBrand(brand.id);

  const locations = locationsData.map(location => ({
    ...location,
    supportsDelivery: location.deliveryTypes.includes('delivery'),
    supportsPickup: location.deliveryTypes.includes('pickup'),
  }));

  return <BrandPageComponent brand={brand} locations={locations} />;
}
