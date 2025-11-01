// src/app/[brandSlug]/[locationSlug]/page.tsx
import EmptyState from "@/components/ui/empty-state";
import { getBrandAndLocation } from "@/lib/data/brand-location";
import { getCatalogCounts, getMenuForRender } from "@/lib/server/catalog";
import { logDiag } from "@/lib/log";
import ProductGrid from "@/components/catalog/product-grid";
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import BrandPageClient from "./BrandPageClient";
import { getActiveCombosForLocation } from "@/app/superadmin/combos/actions";
import { getActiveStandardDiscounts } from "@/app/superadmin/standard-discounts/actions";
import { getProductsForLocation } from "@/app/superadmin/products/actions";
import { getCategoriesForLocation } from "@/app/superadmin/categories/actions";
import { HeroBanner } from "@/components/layout/hero-banner";

export const runtime = 'nodejs';
export const revalidate = 0; // Or a specific time in seconds

type UICategory = { id: string; name: string };
type UIMenu = {
  categories: UICategory[];
  productsByCategory: Record<string, any[]>;
  fallbackUsed?: boolean;
};

export default async function LocationPage({ params }: AsyncPageProps<{ brandSlug: string; locationSlug: string }>) {
  const { brandSlug, locationSlug } = await resolveParams(params);

  try {
    const { brand, location, ok } = await getBrandAndLocation(brandSlug, locationSlug);

    if (!ok || !brand || !location) {
      return <EmptyState title="Butik ikke fundet" hint="Den angivne brand- eller lokations-URL er ugyldig." />;
    }
    
    // Fetch all necessary data on the server
    const [categories, activeCombos, allProductsForLocation, activeStandardDiscounts] = await Promise.all([
      getCategoriesForLocation(location.id),
      getActiveCombosForLocation(location.id),
      getProductsForLocation(location.id),
      getActiveStandardDiscounts({ brandId: brand.id, locationId: location.id, deliveryType: 'delivery' }), // Fetch initial discounts
    ]);
  
    const offerCategoryPlaceholder: UICategory = {
        id: 'offers',
        name: brand.offersHeading || 'Offers',
    };

    const finalCategories = [offerCategoryPlaceholder, ...categories].sort((a: any, b: any) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

    return (
        <>
            <HeroBanner location={location} />
            <BrandPageClient
                brand={brand}
                location={location}
                menu={{ categories: finalCategories, productsByCategory: { [offerCategoryPlaceholder.id]: [], ...allProductsForLocation.reduce((acc, p) => {
                    if (!acc[p.categoryId]) acc[p.categoryId] = [];
                    acc[p.categoryId].push(p);
                    return acc;
                }, {} as Record<string, any[]>) } }}
                activeCombos={activeCombos}
                activeStandardDiscounts={activeStandardDiscounts}
            />
        </>
    );

  } catch(e:any) {
    await logDiag?.({ scope:"brand-page", message:"Top-level render failure (wrapper)", details:{ brandSlug, locationSlug, error:String(e?.message??e), stack:e?.stack??null } }).catch(()=>{});
    return <EmptyState title="Noget gik galt på brand-siden" hint="Der opstod en fejl under renderingen." details={process.env.NEXT_PUBLIC_ENABLE_ENV_DEBUG ? String(e?.stack ?? e) : undefined}/>;
  }
}
