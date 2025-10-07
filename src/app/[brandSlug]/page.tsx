

import { LocationCard } from "@/components/location-card";
import type { Brand, Location } from "@/types";
import { getBrandBySlug } from "../superadmin/brands/actions";
import { getLocationsForBrand } from "../superadmin/locations/actions";
import { notFound } from "next/navigation";
import { BrandLayoutClient } from "./layout-client";

// OF-544: restore valid interface name (avoid forbidden framework types)
interface BrandPageData {
  brand: any;
  locations: any[];
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


export default async function BrandPage(props: any) {
  // OF-537: defensive props handling (Next may pass Promise<any>)
  const rawParams = (props && typeof props === "object") ? (props as any).params : undefined;
  const rawSearch = (props && typeof props === "object") ? (props as any).searchParams : undefined;
  const params = await Promise.resolve(rawParams ?? {});
  const searchParams = await Promise.resolve(rawSearch ?? {});

  const brandSlug = typeof params.brandSlug === "string" ? params.brandSlug : undefined;

  if (!brandSlug) {
    notFound();
  }

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
