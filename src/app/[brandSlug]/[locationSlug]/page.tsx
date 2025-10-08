
// src/app/[brandSlug]/[locationSlug]/page.tsx
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { logDiag } from "@/lib/log";
import { getCatalogCounts, getMenuForRender } from "@/lib/data/catalog";
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";

// 🔧 NYT: normaliser legacy/new probe shape
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

  // Hvis ny struktur (har flags), brug den:
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

  // Legacy struktur (intet flags-felt) -> afled flags her:
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

  return {
    brand,
    location,
    ok: hasBrand && hasLocation && brandMatchesLocation,
    flags: { hasBrand, hasLocation, hasBrandIdField, brandMatchesLocation },
    hints,
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: { brandSlug: string; locationSlug: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { brandSlug, locationSlug } = params;
  const safe = String(searchParams?.safe ?? "").toLowerCase() === "1";

  try {
    // HENT & NORMALISÉR
    const rawProbe = await getBrandAndLocation(brandSlug, locationSlug);
    const probe = normalizeProbe(rawProbe);

    // --- uændret logik nedenfor, men bruger nu probe.flags/probe.hints sikkert ---
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

    // SAFE MODE (som i OF-560)
    if (safe) {
      const counts = await getCatalogCounts({ brandId: probe.brand!.id });
      const menu = await getMenuForRender({ brandId: probe.brand!.id });

      return (
        <div className="mx-auto max-w-3xl p-4">
          <h1 className="text-2xl font-bold mb-4">
            Safe Mode – {probe.brand?.name ?? brandSlug} / {probe.location?.name ?? locationSlug}
          </h1>
          <pre className="text-xs bg-black/5 p-3 rounded mb-4">
            {JSON.stringify({ counts, fallbackUsed: menu.fallbackUsed }, null, 2)}
          </pre>
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
          {menu.fallbackUsed ? (
            <p className="text-sm opacity-70 mt-4">Viser fallback “Menu”, fordi ingen kategorier fandtes.</p>
          ) : null}
        </div>
      );
    }

    // NORMAL PATH (som i OF-557/OF-555)
    const counts = await getCatalogCounts({ brandId: probe.brand!.id });
    const menu = await getMenuForRender({ brandId: probe.brand!.id });

    if (counts.products === 0) {
      return <EmptyState title="Menu er ikke sat op endnu" hint="Der er ingen aktive produkter." details={`counts=${JSON.stringify(counts)}`} />;
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
        {menu.fallbackUsed ? <p className="text-sm opacity-70">Viser fallback “Menu”, fordi ingen kategorier fandtes. Opret kategorier i Superadmin for fuld visning.</p> : null}
      </div>
    );
  } catch (e: any) {
    await logDiag({
      scope: "brand-page",
      message: "Top-level render failure (post-normalize)",
      details: { brandSlug, locationSlug, error: String(e?.message ?? e), stack: e?.stack ?? null },
    });

    return (
      <EmptyState
        title="Noget gik galt på brand-siden"
        hint="Der opstod en fejl under renderingen."
        details={process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG ? String(e?.stack ?? e) : undefined}
        actions={
          <a className="px-4 py-2 rounded bg-black text-white" href={`/api/debug/diag-logs?scope=brand-page`} target="_blank">
            Åbn logs
          </a>
        }
      />
    );
  }
}
