import 'server-only';
import sharp from 'sharp';
import { rasterData } from '@/lib/storefront-media';

export const ICON_SIZES = [180, 192, 512] as const;
const MAX_LOGO_BYTES = 2_000_000;
const LOGO_HOSTS = new Set(['cdn.prod.website-files.com', 'firebasestorage.googleapis.com', 'res.cloudinary.com', 'i.postimg.cc', 'images.unsplash.com', 'picsum.photos', 'placehold.co']);

// An inline (data:) logo is decoded; a URL is fetched only from LOGO_HOSTS,
// without following redirects, and abandoned as soon as it passes the size limit.
export async function logoBuffer(source: string | null, fetcher: typeof fetch = fetch): Promise<Buffer | null> {
  if (!source) return null;
  const inline = source.match(rasterData);
  if (inline) {
    const buffer = Buffer.from(inline[2], 'base64');
    return buffer.length > MAX_LOGO_BYTES ? null : buffer;
  }
  let url: URL;
  try { url = new URL(source); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !LOGO_HOSTS.has(url.hostname)) return null;
  try {
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = Number(response.headers.get('content-length') || 0);
    if (size > MAX_LOGO_BYTES) { await reader.cancel(); return null; }
    size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_LOGO_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
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
      const fitted = await sharp(logo, { limitInputPixels: 40_000_000 }).resize(inner, inner, { fit: 'inside' }).png().toBuffer();
      return await canvas.composite([{ input: fitted, gravity: 'centre' }]).png().toBuffer();
    } catch { /* not an image sharp can read: plain icon */ }
  }
  return canvas.png().toBuffer();
}
