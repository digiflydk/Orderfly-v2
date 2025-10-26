// src/app/[brandSlug]/[locationSlug]/page.tsx
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { getCatalogCounts, getMenuForRender } from "@/lib/server/catalog";
import { logDiag } from "@/lib/log";
import ProductGrid from "@/components/catalog/product-grid";
import { AsyncPageProps } from "@/types/next-async-props";

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

export default async function Page({
  params,
  searchParams,
}: AsyncPageProps<{ brandSlug: string; locationSlug: string }>) {
  const { brandSlug, locationSlug } = await params;
  const safe = String(searchParams?.safe ?? "").toLowerCase() === "1";

  try {
    const raw = await getBrandAndLocation(brandSlug, locationSlug);
    const probe = normalizeProbe(raw);

    if(!probe.flags.hasBrand || !probe.flags.hasLocation){
      return <EmptyState title="Butik ikke konfigureret" hint={probe.hints.missing || "Mangler data."} details={`brand=${brandSlug}\nlocation=${locationSlug}`}/>;
    }
    if(!probe.flags.hasBrandIdField || !probe.flags.brandMatchesLocation){
      return <EmptyState title="Butik er ikke linket korrekt" hint={probe.hints.link || "Location er ikke linket til brandet."}
        details={`brand.id=${probe.brand?.id}\nlocation.id=${probe.location?.id}\nlocation.brandId=${probe.location?.brandId ?? "(mangler)"}`}/>;
    }

    const counts = await getCatalogCounts({ brandId: probe.brand!.id });
    const menu = await getMenuForRender({ brandId: probe.brand!.id });

    if(safe){
      return (
        <div className="mx-auto max-w-3xl p-4">
          <h1 className="text-2xl font-bold mb-4">Safe Mode – {probe.brand?.name ?? brandSlug} / {probe.location?.name ?? locationSlug}</h1>
          <pre className="text-xs bg-black/5 p-3 rounded mb-4">{JSON.stringify({ counts, fallbackUsed: menu.fallbackUsed }, null, 2)}</pre>
          {menu.categories.map((cat: { id: string; name: string })=>(
            <section key={cat.id} className="mb-6">
              <h2 className="font-semibold">{cat.name}</h2>
              <ul className="list-disc ml-5 mt-2">
                {(menu.productsByCategory[cat.id as keyof typeof menu.productsByCategory] ?? []).map((p:any)=>(<li key={p.id}>{p.productName || p.name || p.title || "Uden navn"}</li>))}
              </ul>
            </section>
          ))}
          {menu.fallbackUsed ? <p className="text-sm opacity-70 mt-4">Viser fallback “Menu”, fordi ingen kategorier fandtes.</p> : null}
        </div>
      );
    }

    if (counts.products === 0) {
      return (
        <EmptyState
          title="Menu er ikke sat op endnu"
          hint="Der er ingen aktive produkter."
          details={`counts=${JSON.stringify(counts)}`}
        />
      );
    }

    return (
      <div className="mx-auto max-w-5xl p-4">
        <header className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">{probe.brand?.name ?? brandSlug}</h1>
          <p className="opacity-70">{probe.location?.name ?? locationSlug}</p>
        </header>
        <ProductGrid menu={menu}/>
      </div>
    );
  }catch(e:any){
    await logDiag?.({ scope:"brand-page", message:"Top-level render failure (wrapper)", details:{ brandSlug, locationSlug, error:String(e?.message??e), stack:e?.stack??null } }).catch(()=>{});
    return <EmptyState title="Noget gik galt på brand-siden" hint="Der opstod en fejl under renderingen." details={process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG ? String(e?.stack ?? e) : undefined}/>;
  }
}
