import { deflateSync } from 'node:zlib';
import { z } from 'zod';
import { renderKitchenReceipt } from './kitchen-receipt';
import { kitchenBitmapGlyph } from './kitchen-bitmap-font';

export const KITCHEN_PNG_LIMITS = Object.freeze({ heightDots: 8192, payloadBytes: 262144 });
const profileSchema = z.object({
  model: z.enum(['mc-print2', 'mc-print3']),
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
}).strict().refine(value => value.model !== 'mc-print2' || value.paperWidthMm === 58);

export class KitchenPngError extends Error {
  constructor(readonly code: 'invalid_profile' | 'unsupported_character' | 'image_too_large') { super(code); }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii'), value = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of value) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, value, checksum]);
}

/** Pure CPU-only PNG encoder. No printer emulation commands, I/O, font fallback or dispatch. */
export function encodeKitchenPng(snapshot: unknown, profile: unknown, version: 1 | 2 = 2) {
  const parsed = profileSchema.safeParse(profile);
  if (!parsed.success || ![1, 2].includes(version)) throw new KitchenPngError('invalid_profile');
  const { model, paperWidthMm } = parsed.data;
  const scale = version === 1 ? 2 : 4, cell = 6 * scale, rowHeight = 12 * scale;
  const width = paperWidthMm === 58 ? 384 : 576;
  const preview = renderKitchenReceipt(snapshot, { paperWidthMm, columns: width / cell });
  const lines = preview.text.slice(0, -1).split('\n');
  // V2 doubles glyphs and wraps before rasterization; v1 remains byte-stable for saved jobs.
  const height = lines.length * rowHeight + 8;
  if (height > KITCHEN_PNG_LIMITS.heightDots) throw new KitchenPngError('image_too_large');
  // Validate the entire text before allocating image memory, never partially encode a job.
  const glyphs = lines.map(line => Array.from(line, character => {
    const glyph = kitchenBitmapGlyph(character);
    if (!glyph) throw new KitchenPngError('unsupported_character');
    return glyph;
  }));
  const stride = width / 8 + 1;
  const pixels = Buffer.alloc(stride * height, 255); // 1-bit grayscale: white=1, black=0.
  for (let y = 0; y < height; y++) pixels[y * stride] = 0; // PNG filter None.
  glyphs.forEach((line, lineIndex) => line.forEach((glyph, column) => {
    glyph.forEach((row, gy) => {
      for (let gx = 0; gx < 5; gx++) if (row & (1 << (4 - gx))) {
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          const x = column * cell + gx * scale + dx, y = 4 + lineIndex * rowHeight + gy * scale + dy;
          pixels[y * stride + 1 + (x >>> 3)] &= ~(1 << (7 - (x & 7)));
        }
      }
    });
  }));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 1; // grayscale, no alpha.
  const payload = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  if (payload.length > KITCHEN_PNG_LIMITS.payloadBytes) throw new KitchenPngError('image_too_large');
  return {
    contentType: 'image/png' as const, payload,
    raster: { model, paperWidthMm, widthDots: width, heightDots: height,
      font: 'orderfly-kitchen-bitmap-v1' as const, physicalFitVerified: false as const },
  };
}
