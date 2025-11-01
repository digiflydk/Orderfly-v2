// src/app/[brandSlug]/[locationSlug]/page.tsx
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { getCatalogCounts, getMenuForRender } from "@/lib/server/catalog";
import { logDiag } from "@/lib/log";
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import BrandPageClient from "./BrandPageClient";

export const runtime = 'nodejs';
export const revalidate = 0; // Or a specific time in seconds

type UICategory = { id: string; name: string };
type UIProduct = { id: string; name?: string; productName?: string; title?: string };
type UIMenu = {
  categories: UICategory[];
  productsByCategory: Record<string, UIProduct[]>;
  fallbackUsed?: boolean;
};

type Probe = {
  brand?: { name?: string } | null;
  location?: { name?: string } | null;
  ok: boolean;
  flags: any;
  hints: any;
};

function normalizeProbe(raw: any): Probe {
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

export default async function LocationPage({ params }: AsyncPageProps<{ brandSlug: string; locationSlug: string }>) {
  const { brandSlug, locationSlug } = await resolveParams(params);

  try {
    const raw = await getBrandAndLocation(brandSlug, locationSlug);
    const probe = normalizeProbe(raw);

    if (!probe.ok) {
      return <EmptyState title="Butik ikke konfigureret" hint={probe.hints.missing || "Mangler data."} details={`brand=${brandSlug}\nlocation=${locationSlug}`}/>;
    }

    const menu = await getMenuForRender({ brandId: probe.brand!.id, locationId: probe.location!.id });

    return (
      <BrandPageClient
        menu={menu as UIMenu}
        probe={probe}
        brandSlug={brandSlug}
        locationSlug={locationSlug}
      />
    );
  } catch(e:any) {
    await logDiag?.({ scope:"brand-page", message:"Top-level render failure (wrapper)", details:{ brandSlug, locationSlug, error:String(e?.message??e), stack:e?.stack??null } }).catch(()=>{});
    return <EmptyState title="Noget gik galt på brand-siden" hint="Der opstod en fejl under renderingen." details={process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG ? String(e?.stack ?? e) : undefined}/>;
  }
}
