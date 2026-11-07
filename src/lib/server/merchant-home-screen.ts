import 'server-only';
import type { Metadata, MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { brandSlugFromHost } from '@/lib/brand-subdomain';
import { loadStorefrontHomeScreen } from '@/lib/server/storefront-home-screen';
import { storefrontInstallMetadata } from '@/lib/storefront-home-screen';

// Existing 256px Apple icon from Esmeralda's published website, verified visually.
// Unlike the stored white header logo, this original is readable on a light tile.
export const ESMERALDA_MERCHANT_ICON = 'https://www.esmeraldapizza.dk/_assets/39b10ae1488aabfa8b0fa860.jpg';
export function merchantManifestIcons(slug: string, fallback: MetadataRoute.Manifest['icons']) {
  return slug === 'esmeralda' ? [{ src: ESMERALDA_MERCHANT_ICON, sizes: '256x256', type: 'image/jpeg', purpose: 'any' as const }] : fallback;
}

export async function merchantInstallBrand(host: string | null) {
  const slug = brandSlugFromHost(host);
  return slug ? loadStorefrontHomeScreen(slug, host) : null;
}

export async function merchantInstallMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const brand = await merchantInstallBrand(requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'));
  if (!brand) return { title: 'Merchant • Orderfly', robots: { index: false, follow: false } };
  return { ...storefrontInstallMetadata(brand), description: `${brand.name} medarbejderportal`,
    ...(brand.slug === 'esmeralda' ? { icons: { icon: ESMERALDA_MERCHANT_ICON, shortcut: ESMERALDA_MERCHANT_ICON, apple: [{ url: ESMERALDA_MERCHANT_ICON, sizes: '256x256', type: 'image/jpeg' }] } } : {}),
    manifest: '/api/merchant/manifest', robots: { index: false, follow: false } };
}
