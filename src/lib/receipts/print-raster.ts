import 'server-only';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import type { ReceiptSvg } from './print-layout';

const fail = (): never => { throw new Error('receipt_render_unavailable'); };
const MAX_LOGO_BYTES = 524288;
// Only known public image services. No redirects, credentials, private hosts,
// arbitrary ports or user-controlled SVG are fetched by the print renderer.
const LOGO_HOSTS = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com',
  'res.cloudinary.com', 'i.postimg.cc', 'images.unsplash.com', 'placehold.co', 'picsum.photos']);
export function receiptLogoUrl(value: string): URL {
  let url: URL; try { url = new URL(value); } catch { return fail(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !LOGO_HOSTS.has(url.hostname)) return fail();
  return url;
}
export async function resolveReceiptLogo(value: string): Promise<string> {
  const response = await fetch(receiptLogoUrl(value), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok || !response.body || !/^image\/(png|jpeg|webp)(?:;|$)/i.test(response.headers.get('content-type') ?? '')
    || Number(response.headers.get('content-length') ?? 0) > MAX_LOGO_BYTES) return fail();
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const result = await reader.read(); if (result.done) break;
      size += result.value.length;
      if (size > MAX_LOGO_BYTES) { await reader.cancel(); return fail(); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  const input = Buffer.concat(chunks);
  // Decode/re-encode raster only, with bounded decoded pixels; strip metadata.
  const image = sharp(input, { limitInputPixels: 4_000_000, animated: false });
  const metadata = await image.metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) return fail();
  const png = await image.resize({ width: 544, height: 160, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  if (png.length > MAX_LOGO_BYTES) return fail();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** Same SVG geometry as the browser; bundled fonts make output independent of
 * Firebase's installed fonts. Existing frozen job payloads are never rerendered. */
export async function rasterizeReceipt(document: ReceiptSvg): Promise<{ payload: Buffer; sha256: string }> {
  if (![384, 576].includes(document.width) || !Number.isSafeInteger(document.height)
    || document.height < 1 || document.height > 8192 || document.svg.length > 1_000_000) return fail();
  const fonts = join(process.cwd(), 'public', 'fonts', 'orderfly');
  const svg = document.svg.replace(/<style>[\s\S]*?<\/style>/g, '');
  const renderer = new Resvg(svg, { font: { loadSystemFonts: false,
    fontFiles: [join(fonts, 'DejaVuSansMono.ttf'), join(fonts, 'DejaVuSansMono-Bold.ttf')],
    defaultFontFamily: 'DejaVu Sans Mono' }, background: '#fff' });
  if (renderer.imagesToResolve().length || renderer.width !== document.width || renderer.height !== document.height) return fail();
  const rendered = renderer.render();
  const payload = await sharp(rendered.pixels, { raw: { width: document.width, height: document.height, channels: 4 } })
    .flatten({ background: '#fff' }).grayscale().threshold(180).png({ palette: true, colours: 2, dither: 0 }).toBuffer();
  if (payload.length > 262144) return fail();
  return { payload, sha256: createHash('sha256').update(payload).digest('hex') };
}
