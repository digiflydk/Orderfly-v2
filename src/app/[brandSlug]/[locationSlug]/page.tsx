// øverst:
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { logDiag } from "@/lib/log";

export default async function Page({ params }: { params: { brandSlug: string; locationSlug: string } }) {
  const { brandSlug, locationSlug } = params as { brandSlug: string; locationSlug: string };
  
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
  

  if (!probe.brand || !probe.location) {
    return (
      <EmptyState
        title="Ingen data for denne butik endnu"
        hint={`Mangler ${
          !probe.brand && !probe.location
            ? "brand og location"
            : !probe.brand
            ? "brand"
            : "location"
        }.`}
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
  

  if (!probe.brandMatchesLocation) {
    return (
      <EmptyState
        title="Butik er ikke linket korrekt"
        hint={`location.brandId skal være ${probe.brand.id}.`}
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

  // ... her fortsætter din normale rendering af siden (menu, produkter, osv.)
}
