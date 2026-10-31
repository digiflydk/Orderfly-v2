import type { Metadata, MetadataRoute } from 'next';
import { brandSlugError, brandSlugFromHost, storefrontPath } from '@/lib/brand-subdomain';

export type StorefrontHomeScreen = { slug: string; name: string; background: string };

export function storefrontInstallHostAllowed(slug: string, host: string | null) {
  const hostBrand = brandSlugFromHost(host);
  return !brandSlugError(slug) && (!hostBrand || hostBrand === slug);
}

export function storefrontInstallBase(slug: string, host: string | null): string {
  return storefrontPath(slug, brandSlugFromHost(host) === slug);
}

export function storefrontInstallAssets(slug: string) {
  const base = `/api/storefront/brands/${encodeURIComponent(slug)}`;
  return { manifest: `${base}/manifest.webmanifest`, icon: (size: number) => `${base}/icon/${size}` };
}

export function storefrontInstallMetadata(brand: Pick<StorefrontHomeScreen, 'slug' | 'name'>): Metadata {
  const assets = storefrontInstallAssets(brand.slug);
  return {
    title: { absolute: brand.name },
    applicationName: brand.name,
    description: `Bestil mad hos ${brand.name}.`,
    manifest: assets.manifest,
    icons: {
      icon: [{ url: assets.icon(192), sizes: '192x192', type: 'image/png' }],
      shortcut: assets.icon(192),
      apple: [{ url: assets.icon(180), sizes: '180x180', type: 'image/png' }],
    },
    appleWebApp: { capable: true, title: brand.name, statusBarStyle: 'default' },
  };
}

export function storefrontInstallManifest(brand: StorefrontHomeScreen, host: string | null): MetadataRoute.Manifest {
  const base = storefrontInstallBase(brand.slug, host);
  const assets = storefrontInstallAssets(brand.slug);
  return {
    id: base,
    name: brand.name,
    short_name: brand.name,
    lang: 'da',
    dir: 'ltr',
    start_url: base,
    scope: base,
    display: 'standalone',
    background_color: brand.background,
    theme_color: brand.background,
    icons: [
      { src: assets.icon(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: assets.icon(512), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: assets.icon(512), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
