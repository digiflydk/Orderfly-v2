
// src/app/[brandSlug]/[locationSlug]/page.tsx
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { getCatalogCounts, getMenuForRender } from "@/lib/data/catalog";
import { logDiag } from "@/lib/log";
import BrandPageClient from "./BrandPageClient";
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { getActiveCombosForLocation } from "@/app/superadmin/combos/actions";
import { getActiveStandardDiscounts } from "@/app/superadmin/standard-discounts/actions";
import type { Location } from '@/types';
import { HeroBanner } from '@/components/layout/hero-banner';

// Normalizer function to handle both old and new probe structures
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
  else if (hasLocation && hasBrand && !brandMatchesLocation) hints.link = `location.brandId matcher ikke brand.id (${location!.brandId} ≠ ${brand!.id}).`;

  return { brand, location, ok: hasBrand && hasLocation && brandMatchesLocation, flags: { hasBrand, hasLocation, hasBrandIdField, brandMatchesLocation }, hints };
}


export default async function Page({ params, searchParams }: AppTypes.AsyncPageProps) {
  const { brandSlug, locationSlug } = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);
  const safe = String(query.safe ?? "").toLowerCase() === "1";

  try {
    const rawProbe = await getBrandAndLocation(brandSlug, locationSlug);
    const probe = normalizeProbe(rawProbe);

    if (!probe.flags.hasBrand || !probe.flags.hasLocation) {
      return (
        <EmptyState
          title="Butik ikke konfigureret"
          hint={probe.hints.missing || "Mangler brand eller location-data."}
          details={`brandSlug=${brandSlug}\nlocationSlug=${locationSlug}`}
          actions={<a className="px-4 py-2 rounded bg-black text-white" href={`/api/diag/brand-location?brandSlug=${brandSlug}&locationSlug=${locationSlug}`} target="_blank">Åbn diagnose</a>}
        />
      );
    }
    if (!probe.flags.hasBrandIdField || !probe.flags.brandMatchesLocation) {
      return (
        <EmptyState
          title="Butik er ikke linket korrekt"
          hint={probe.hints.link || "Location er ikke linket til brandet."}
          details={`brand.id=${probe.brand?.id}\nlocation.id=${probe.location?.id}\nlocation.brandId=${probe.location?.brandId ?? "(mangler)"}`}
          actions={<a className="px-4 py-2 rounded bg-black text-white" href={`/api/diag/brand-location?brandSlug=${brandSlug}&locationSlug=${locationSlug}`} target="_blank">Åbn diagnose</a>}
        />
      );
    }
    
    const brand = probe.brand!;
    const fetchedLocation = probe.location! as Location;

    // Validate smileyUrl server-side
    const rawUrl = (fetchedLocation.smileyUrl || '').trim();
    const isValid = /^https?:\/\//i.test(rawUrl);
    const location: Location = {
        ...fetchedLocation,
        smileyUrl: isValid ? rawUrl : undefined,
    };

    const [menu, activeCombos, activeStandardDiscounts, counts] = await Promise.all([
      getMenuForRender({ brandId: brand.id }),
      getActiveCombosForLocation(location.id),
      getActiveStandardDiscounts({ brandId: brand.id, locationId: location.id, deliveryType: 'delivery' }),
      getCatalogCounts({ brandId: brand.id }),
    ]);

    if (safe) {
      return (
        <div className="mx-auto max-w-3xl p-4">
          <h1 className="text-2xl font-bold mb-4">Safe Mode – {brand.name ?? brandSlug} / {location.name ?? locationSlug}</h1>
          <pre className="text-xs bg-black/5 p-3 rounded mb-4">{JSON.stringify({ counts, fallbackUsed: menu.fallbackUsed, activeCombos: activeCombos.length, activeDiscounts: activeStandardDiscounts.length }, null, 2)}</pre>
          {menu.categories.map((cat) => (
            <section key={cat.id} className="mb-6">
              <h2 className="font-semibold">{cat.name}</h2>
              <ul className="list-disc ml-5 mt-2">
                {(menu.productsByCategory[cat.id] ?? []).map((p: any) => (
                  <li key={p.id}>{p.name}{"price" in p ? ` — ${p.price} kr` : ""}</li>
                ))}
              </ul>
            </section>
          ))}
          {menu.fallbackUsed ? <p className="text-sm opacity-70 mt-4">Viser fallback “Menu”, fordi ingen kategorier fandtes.</p> : null}
        </div>
      );
    }
    
    if (counts.products === 0) {
      return <EmptyState title="Menu er ikke sat op endnu" hint="Der er ingen aktive produkter." details={`counts=${JSON.stringify(counts)}`} />;
    }

    return (
      <>
        <div className="space-y-6 pt-6">
            <HeroBanner location={location} />
            <BrandPageClient
              brand={brand}
              location={location}
              menu={menu}
              activeCombos={activeCombos}
              activeStandardDiscounts={activeStandardDiscounts}
            />
        </div>
      </>
    );
  } catch (e: any) {
    await logDiag({
      scope: "brand-page",
      message: "Top-level render failure (wrapper)",
      details: { brandSlug, locationSlug, error: String(e?.message ?? e), stack: e?.stack ?? null },
    });
    return (
      <EmptyState
        title="Noget gik galt på brand-siden"
        hint="Der opstod en fejl under renderingen."
        details={process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG ? String(e?.stack ?? e) : undefined}
        actions={<a className="px-4 py-2 rounded bg-black text-white" href={`/api/debug/diag-logs?scope=brand-page`} target="_blank">Åbn logs</a>}
      />
    );
  }
}
