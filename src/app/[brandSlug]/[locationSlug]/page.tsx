
// src/app/[brandSlug]/[locationSlug]/page.tsx
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { logDiag } from "@/lib/log";
import { getCatalogCounts, getMenuForRender } from "@/lib/data/catalog";
import { MenuClient } from './menu-client';
import { HeroBanner } from '@/components/layout/hero-banner';
import { notFound } from "next/navigation";
import type { ProductForMenu, Location } from '@/types';

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

  // --- Catalog check ---
  const counts = await getCatalogCounts({ brandId: probe.brand.id });

  if (counts.categories === 0 || counts.products === 0) {
    return (
      <EmptyState
        title="Menu er ikke sat op endnu"
        hint="Der er ingen kategorier og/eller produkter for dette brand."
        details={`counts=${JSON.stringify(counts)}\nTip: Tjek /api/diag/catalog?brandSlug=${brandSlug}`}
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

  // Happy path
  const { categories, productsByCategory } = await getMenuForRender({ brandId: probe.brand.id });
  const allProducts = Object.values(productsByCategory).flat();

  // Your existing rendering logic. If MenuClient expects flat arrays, we provide them.
  return (
    <>
      <div className="space-y-6 pt-6">
        <HeroBanner location={probe.location as Location} />
        
        <MenuClient 
            brand={probe.brand as any}
            location={probe.location as any}
            initialCategories={categories}
            initialProducts={allProducts as ProductForMenu[]}
            initialActiveCombos={[]} // Assuming combos are fetched in client or not implemented yet
            initialActiveStandardDiscounts={[]} // Assuming discounts are fetched in client
        />
      </div>
    </>
  );
}
