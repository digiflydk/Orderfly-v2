// src/app/[brandSlug]/[locationSlug]/page.tsx
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { getCatalogCounts, getMenuForRender } from "@/lib/data/catalog";
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams } from "@/lib/next/resolve-props";

export default async function Page({ params }: AppTypes.AsyncPageProps) {
  const { brandSlug, locationSlug } = await resolveParams(params);

  const probe = await getBrandAndLocation(brandSlug, locationSlug);

  // 1) Missing brand/location → tydelig besked (ingen crash)
  if (!probe.flags.hasBrand || !probe.flags.hasLocation) {
    return (
      <EmptyState
        title="Butik ikke konfigureret"
        hint={probe.hints.missing || "Mangler brand eller location-data."}
        details={`brandSlug=${brandSlug}\nlocationSlug=${locationSlug}`}
        actions={
          <a
            className="px-4 py-2 rounded bg-black text-white"
            href={`/api/diag/brand-location?brandSlug=${brandSlug}&locationSlug=${locationSlug}`}
            target="_blank"
          >
            Åbn diagnose
          </a>
        }
      />
    );
  }

  // 2) Link-mangler eller mismatch → vis besked
  if (!probe.flags.hasBrandIdField || !probe.flags.brandMatchesLocation) {
    return (
      <EmptyState
        title="Butik er ikke linket korrekt"
        hint={probe.hints.link || "Location er ikke linket til brandet."}
        details={`brand.id=${probe.brand?.id}\nlocation.id=${probe.location?.id}\nlocation.brandId=${probe.location?.brandId ?? "(mangler)"}`}
        actions={
          <a
            className="px-4 py-2 rounded bg-black text-white"
            href={`/api/diag/brand-location?brandSlug=${brandSlug}&locationSlug=${locationSlug}`}
            target="_blank"
          >
            Åbn diagnose
          </a>
        }
      />
    );
  }

  // 3) Happy path: render menu (inkl. fallback fra OF-555)
  const counts = await getCatalogCounts({ brandId: probe.brand!.id });
  const menu = await getMenuForRender({ brandId: probe.brand!.id });

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
    <div className="mx-auto max-w-4xl p-4">
      {menu.categories.map((cat) => (
        <section key={cat.id} className="mb-8">
          <h2 className="text-xl font-semibold mb-3">{cat.name}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(menu.productsByCategory[cat.id] ?? []).map((p: any) => (
              <div key={p.id} className="rounded border p-4">
                <div className="font-medium">{p.name}</div>
                {"price" in p ? <div className="opacity-80 mt-1">{p.price} kr</div> : null}
              </div>
            ))}
          </div>
        </section>
      ))}
      {menu.fallbackUsed ? (
        <p className="text-sm opacity-70">
          Viser fallback “Menu”, fordi ingen kategorier fandtes. Opret kategorier i Superadmin for fuld visning.
        </p>
      ) : null}
    </div>
  );
}
