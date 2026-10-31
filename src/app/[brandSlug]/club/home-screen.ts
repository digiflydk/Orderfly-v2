import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { findPortal, portalBase } from './data';
import { portalPreset } from './brand-preset';

// Home-screen support (spec §4.6): the web app manifest and square icons made
// from the brand logo on the brand's background colour.
export { ICON_SIZES, logoBuffer, homeScreenIcon } from '@/lib/server/home-screen-icon';

export async function homeScreenBrand(slug: string) {
  const [portal, base] = await Promise.all([findPortal(slug), portalBase(slug)]);
  if (!portal) return null;
  // The stored brand record: its logo may be an inline image the storefront serves through /api/storefront-image.
  const stored = (await getAdminDb().collection('brands').doc(portal.brand.brandId).get()).data();
  const preset = portalPreset({ slug, name: portal.brand.brandName, logoUrl: typeof stored?.logoUrl === 'string' ? stored.logoUrl : null,
    background: stored?.appearances?.colors?.background });
  return { name: portal.program.name, base, preset };
}

export function manifest(name: string, base: string, background: string) {
  return {
    name, short_name: name, lang: 'da', dir: 'ltr', start_url: base, scope: base, display: 'standalone',
    background_color: background, theme_color: background,
    icons: [
      { src: `${base}/ikon/192`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/ikon/512`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/ikon/512`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
