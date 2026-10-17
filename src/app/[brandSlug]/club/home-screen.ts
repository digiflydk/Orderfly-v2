import 'server-only';
import sharp from 'sharp';
import { getBrandBySlug } from '@/lib/data/brand-location';
import { findPortal, portalBase } from './data';
import { portalPreset } from './brand-preset';

// Home-screen support (spec §4.6): the web app manifest and square icons made
// from the brand logo on the brand's background colour.
export const ICON_SIZES = [180, 192, 512] as const;
const MAX_LOGO_BYTES = 2_000_000;

export async function homeScreenBrand(slug: string) {
  const [portal, storefrontBrand, base] = await Promise.all([findPortal(slug), getBrandBySlug(slug), portalBase(slug)]);
  if (!portal) return null;
  const preset = portalPreset({ slug, name: portal.brand.brandName, logoUrl: storefrontBrand?.logoUrl, background: storefrontBrand?.appearances?.colors.background });
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

async function logoBuffer(url: string | null) {
  if (!url || !url.startsWith('https://')) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    const length = Number(response.headers.get('content-length') || 0);
    if (!response.ok || length > MAX_LOGO_BYTES) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > MAX_LOGO_BYTES ? null : buffer;
  } catch { return null; }
}

// The logo fills 60% of the square, inside the safe zone of maskable icons.
// Without a usable logo the icon is the plain brand colour.
export async function homeScreenIcon(size: number, logoUrl: string | null, background: string, fetchLogo = logoBuffer) {
  const canvas = sharp({ create: { width: size, height: size, channels: 4, background } });
  const logo = await fetchLogo(logoUrl);
  if (logo) {
    try {
      const inner = Math.round(size * 0.6);
      const fitted = await sharp(logo).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
      return await canvas.composite([{ input: fitted, gravity: 'centre' }]).png().toBuffer();
    } catch { /* not an image sharp can read: plain icon */ }
  }
  return canvas.png().toBuffer();
}
