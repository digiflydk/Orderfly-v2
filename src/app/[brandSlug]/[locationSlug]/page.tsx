// src/app/[brandSlug]/[locationSlug]/page.tsx
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { logDiag } from "@/lib/log";
import { getCatalogCounts, getMenuForRender } from "@/lib/data/catalog";

export default async function Page({ params }: { params: { brandSlug: string; locationSlug: string } }) {
  const { brandSlug, locationSlug } = params;

  let probe: Awaited<ReturnType<typeof getBrandAndLocation>>;
  try {
    probe = await getBrandAndLocation(brandSlug, locationSlug);
  } catch (e: any) {
    // Serverlog – vigtig for vores fejlsøgning
    await logDiag({
      scope: "brand-page",
      message: "Loader-kast under getBrandAndLocation",
      details: { brandSlug, locationSlug, error: String(e?.message ?? e) },
    });

    const isMissingServiceAccount = /FIREBASE_SERVICE_ACCOUNT is missing/i.test(e?.message);

    // Render venlig fejl (error boundary er fallback – men vi håndterer selv pænere UI)
    return (
      <EmptyState
        title={isMissingServiceAccount ? "Server Configuration Error" : "Noget gik galt på brand-siden"}
        hint={isMissingServiceAccount ? "The FIREBASE_SERVICE_ACCOUNT environment variable is not set. The server cannot connect to the database." : "Fejl opstod under indlæsning af data."}
        details={
          isMissingServiceAccount 
          ? `To fix this, set the FIREBASE_SERVICE_ACCOUNT environment variable in your hosting environment. See .env.local.example for format.`
          : (process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG
            ? `brand=${brandSlug} location=${locationSlug}\n` + String(e?.message ?? e)
            : undefined)
        }
        actions={
          <>
            <a
              className="px-4 py-2 rounded bg-black text-white"
              href={`/api/diag/brand-location?brandSlug=${brandSlug}&locationSlug=${locationSlug}`}
              target="_blank"
            >
              Åbn diagnose
            </a>
            <a className="px-4 py-2 rounded border" href="/">
              Til forsiden
            </a>
          </>
        }
      />
    );
  }
  

  if (!probe.flags.hasBrand || !probe.flags.hasLocation) {
    return (
      <EmptyState
        title="Ingen data for denne butik endnu"
        hint={probe.hints.missing || "Mangler brand eller location-data."}
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

  // MENU-LOAD (ny try/catch)
  try {
    const counts = await getCatalogCounts({ brandId: probe.brand!.id });
    const menu = await getMenuForRender({ brandId: probe.brand!.id });

    if (counts.products === 0) {
      return (
        <EmptyState
          title="Menu er ikke sat op endnu"
          hint="Der er ingen aktive produkter for dette brand."
          details={`counts=${JSON.stringify(counts)}`}
          actions={
            <a
              className="px-4 py-2 rounded bg-black text-white"
              href={`/api/diag/catalog?brandSlug=${brandSlug}`}
              target="_blank"
            >
              Åbn katalog-diagnose
            </a>
          }
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
          <p className="text-sm opacity-70">Viser fallback “Menu”, fordi ingen kategorier fandtes. Opret kategorier i Superadmin for fuld visning.</p>
        ) : null}
      </div>
    );
  } catch (e: any) {
    // log og vis venlig fejl – i praksis ser vi ofte index-fejl her
    await logDiag({
      scope: "brand-page",
      message: "Menu load failure (catalog)",
      details: { brandId: probe.brand?.id, error: String(e?.message ?? e) },
    });
    return (
      <EmptyState
        title="Menu kunne ikke indlæses"
        hint="Der skete en fejl under hentning af produkter/kategorier."
        details={process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG ? String(e?.message ?? e) : undefined}
        actions={<a className="px-4 py-2 rounded bg-black text-white" href={`/api/diag/catalog?brandSlug=${brandSlug}`} target="_blank">Åbn katalog-diagnose</a>}
      />
    );
  }
}
