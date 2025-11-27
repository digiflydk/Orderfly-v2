// src/app/[brandSlug]/[locationSlug]/page.tsx
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { getMenuForRender } from "@/lib/server/catalog";
import { logDiag } from "@/lib/log";
import BrandPageClient from "./BrandPageClient";
import { getActiveCombosForLocation } from "@/app/superadmin/combos/actions";
import { getActiveStandardDiscounts } from "@/app/superadmin/standard-discounts/actions";
import { isAdminReady } from "@/lib/runtime";

type BrandLocationPageProps = {
  params: {
    brandSlug: string;
    locationSlug: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
};

function normalizeProbe(raw: any) {
  if (!raw || typeof raw !== "object") {
    return {
      brand: null,
      location: null,
      flags: { hasBrand: false, hasLocation: false, hasBrandIdField: false, brandMatchesLocation: false },
      hints: { missing: "Mangler brand og location." },
      ok: false,
    };
  }
  const brand = raw.brand ?? null;
  const location = raw.location ?? null;

  if (raw.flags) {
    return {
      ...raw,
      brand,
      location,
      flags: {
        hasBrand: !!raw.flags.hasBrand,
        hasLocation: !!raw.flags.hasLocation,
        hasBrandIdField: !!raw.flags.hasBrandIdField,
        brandMatchesLocation: !!raw.flags.brandMatchesLocation,
      },
      hints: raw.hints ?? {},
    };
  }

  const hasBrand = !!brand?.id;
  const hasLocation = !!location?.id;
  const hasBrandIdField = typeof location?.brandId === "string" && !!location?.brandId;
  const brandMatchesLocation = hasBrand && hasLocation ? (hasBrandIdField ? location.brandId === brand.id : true) : false;

  const hints: any = {};
  if (!hasBrand && !hasLocation) hints.missing = "Mangler både brand og location.";
  else if (!hasBrand) hints.missing = "Mangler brand.";
  else if (!hasLocation) hints.missing = "Mangler location.";
  if (hasLocation && !hasBrandIdField) hints.link = "location.brandId mangler (tilføj brandId).";
  else if (hasLocation && hasBrand && !brandMatchesLocation) hints.link = `location.brandId matcher ikke brand.id (${location.brandId} ≠ ${brand.id}).`;

  return { brand, location, ok: hasBrand && hasLocation && brandMatchesLocation, flags: { hasBrand, hasLocation, hasBrandIdField, brandMatchesLocation }, hints };
}

export default async function Page(props: any) {
  const { params, searchParams } = props as BrandLocationPageProps;
  const { brandSlug, locationSlug } = params;
  
  try {
    const raw = await getBrandAndLocation(brandSlug, locationSlug);
    const probe = normalizeProbe(raw);

    if(!probe.brand || !probe.location || !probe.ok){
      return <EmptyState title="Butik ikke konfigureret" hint={probe.hints.missing || "Mangler data."} details={`brand=${brandSlug}\nlocation=${locationSlug}`}/>;
    }

    const { brand, location } = probe;

    const [menu, activeCombos, activeStandardDiscounts] = await Promise.all([
      getMenuForRender({ brandId: brand.id, locationId: location.id }),
      getActiveCombosForLocation(location.id),
      getActiveStandardDiscounts({ brandId: brand.id, locationId: location.id, deliveryType: 'pickup' }), // Default to pickup
    ]);

    if (!menu || !menu.categories || !menu.productsByCategory) {
      return (
        <EmptyState
          title="Menu er ikke sat op endnu"
          hint="Der er ingen aktive produkter eller kategorier."
        />
      );
    }
    
    return (
      <BrandPageClient 
        brand={brand}
        location={location}
        menu={menu}
        activeCombos={activeCombos}
        activeStandardDiscounts={activeStandardDiscounts}
      />
    );
  } catch(e:any){
    await logDiag?.({ scope:"brand-page", message:"Top-level render failure (wrapper)", details:{ brandSlug, locationSlug, error:String(e?.message??e), stack:e?.stack??null } }).catch(()=>{});
    return <EmptyState title="Noget gik galt på brand-siden" hint="Der opstod en fejl under renderingen." details={process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG ? String(e?.stack ?? e) : undefined}/>;
  }
}
