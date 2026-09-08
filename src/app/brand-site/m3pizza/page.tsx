import { Suspense } from 'react';
import Link from 'next/link';
import { getBrandAndLocation } from '@/lib/data/brand-location';
import { getMenuForRender } from '@/lib/server/catalog';
import { getPublicBrandWebsiteConfig } from '@/lib/public/brand-website/public-config-api';
import { getStorefrontDiscounts } from '@/app/storefront-actions';
import { M3PIZZA_MENU_PATH } from '@/lib/m3pizza-order-flow';
import { optionalCheckoutValue } from '@/lib/optional-checkout';
import LandingClient from './landing-client';

function Loading() {
  return <main data-commerce-root className="min-h-screen bg-black text-white px-6 py-12" aria-busy="true" aria-label="Indlæser menu">
    <div className="mx-auto max-w-5xl space-y-8"><div className="h-12 w-32 rounded bg-white/10" />
    <div className="h-64 rounded-2xl bg-white/10 motion-safe:animate-pulse" />
    <p role="status" className="text-center text-sm text-white/70">Menuen er på vej…</p></div>
  </main>;
}
function Fallback() {
  return <main data-commerce-root className="min-h-screen bg-black text-white p-8"><h1 className="text-3xl font-bold">Bestil mad</h1>
    <p className="my-4">Se restaurantens menu, og vælg levering eller afhentning.</p>
    <div className="flex gap-4"><Link className="rounded bg-primary p-3 text-primary-foreground" href={`${M3PIZZA_MENU_PATH}?deliveryMethod=pickup`}>Afhentning</Link>
    <Link className="rounded border p-3" href={`${M3PIZZA_MENU_PATH}?deliveryMethod=delivery`}>Levering</Link></div></main>;
}
async function Content() {
  try {
    const [, brandSlug, locationSlug] = M3PIZZA_MENU_PATH.split('/');
    const {brand, location} = await getBrandAndLocation(brandSlug, locationSlug);
    if (!brand || !location || !location.isActive) return <Fallback />;
    const [config, menu, pickup, delivery] = await Promise.all([
      optionalCheckoutValue(() => getPublicBrandWebsiteConfig(brand.id), null, 3000),
      getMenuForRender({brandId: brand.id, locationId: location.id}),
      optionalCheckoutValue(() => getStorefrontDiscounts({brandId: brand.id, locationId: location.id, deliveryType: 'pickup'}), [], 3000),
      optionalCheckoutValue(() => getStorefrontDiscounts({brandId: brand.id, locationId: location.id, deliveryType: 'delivery'}), [], 3000),
    ]);
    const products = Object.values(menu.productsByCategory).flat();
    const discounts = [...new Map([...pickup, ...delivery].map(discount => [discount.id, discount])).values()];
    return <LandingClient brand={brand} location={location} products={products as any} discounts={discounts} config={config} />;
  } catch { return <Fallback />; }
}
export default function BrandLanding() {
  return <Suspense fallback={<Loading />}><Content /></Suspense>;
}
