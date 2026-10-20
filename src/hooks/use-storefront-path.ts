'use client';
import { useCallback, useSyncExternalStore } from 'react';
import { brandSlugFromHost, storefrontPath } from '@/lib/brand-subdomain';

const subscribe = () => () => {};

// Storefront links in the browser (#282). The server render keeps /{slug}/…,
// which works on every host; after hydration the brand subdomain gets the short form.
export function useStorefrontPath(slug: string | null | undefined) {
  const host = useSyncExternalStore(subscribe, () => window.location.host, () => null);
  const onBrandSubdomain = !!slug && brandSlugFromHost(host) === slug;
  return useCallback((...segments: string[]) => storefrontPath(slug ?? '', onBrandSubdomain, ...segments), [slug, onBrandSubdomain]);
}

// For event handlers (router.push), where the browser host is always known.
export function browserStorefrontPath(slug: string, ...segments: string[]) {
  return storefrontPath(slug, brandSlugFromHost(window.location.host) === slug, ...segments);
}
