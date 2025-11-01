
import type { AsyncPageProps } from '@/types/next-async-props';
import { isAdminReady } from '@/lib/runtime';
import { getProductsForLocation } from '@/app/superadmin/products/actions';
import { getActiveCombosForLocation } from '@/app/superadmin/combos/actions';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import BrandPageClient from './BrandPageClient';
import { getBrandAndLocation } from '@/lib/data/brand-location';
import { getMenuForRender } from '@/lib/server/catalog';
import EmptyState from '@/components/ui/empty-state';

export const runtime = 'nodejs';
export const revalidate = 0; // Or a specific time in seconds

export default async function LocationPage({ params }: AsyncPageProps<{ brandSlug: string; locationSlug: string }>) {
  const { brandSlug, locationSlug } = params;

  if (!isAdminReady()) {
    // No admin → render safe fallback, no Admin calls
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold mb-4">{brandSlug} / {locationSlug}</h1>
        <p className="text-sm opacity-70">Limited mode: data unavailable until Admin credentials are configured.</p>
      </main>
    );
  }

  // Admin available → use real data
  const { brand, location } = await getBrandAndLocation(brandSlug, locationSlug);

  if (!brand || !location) {
      return <EmptyState title="Not Found" hint="The requested brand or location could not be found." />;
  }

  const [products, combos, discounts, menu] = await Promise.all([
    getProductsForLocation(location.id),
    getActiveCombosForLocation(location.id),
    getActiveStandardDiscounts({brandId: brand.id, locationId: location.id, deliveryType: 'pickup'}), // Default to pickup
    getMenuForRender({brandId: brand.id, locationId: location.id}),
  ]);

  return (
    <BrandPageClient
      brand={brand}
      location={location}
      menu={{
        categories: menu.categories,
        productsByCategory: menu.productsByCategory,
        fallbackUsed: menu.fallbackUsed,
      }}
      activeCombos={combos}
      activeStandardDiscounts={discounts}
    />
  );
}
