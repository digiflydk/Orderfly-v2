import * as QRCode from 'qrcode';
import sharp from 'sharp';
import jsQR from 'jsqr';

export type QrRenderOptions = {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  dark?: string;
  light?: string;
  logo?: Buffer;
};

export type QrRenderErrorCode = 'invalid_payload' | 'invalid_style' | 'insufficient_contrast' | 'payload_too_dense' | 'invalid_logo' | 'unreadable_logo';

export class QrRenderError extends Error {
  constructor(public readonly code: QrRenderErrorCode) {
    super(code);
    this.name = 'QrRenderError';
  }
}

export type RenderedQr = {
  svg: string;
  png: Buffer;
  width: number;
  moduleCount: number;
  style: Required<Omit<QrRenderOptions, 'logo'>>;
};

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

/** Server-side export only. No remote fetch, storage or tracking occurs here. */
export async function renderQr(payload: string, options: QrRenderOptions = {}): Promise<RenderedQr> {
  // Bound work before QRCode.create; reject malformed UTF-16 rather than silently
  // replacing it, so a download can never encode different content from preview.
  if (typeof payload !== 'string' || !payload.trim() || Buffer.byteLength(payload, 'utf8') > 2048
      || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(payload)) {
    throw new QrRenderError('invalid_payload');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['width', 'margin', 'errorCorrectionLevel', 'dark', 'light', 'logo'].includes(key))) {
    throw new QrRenderError('invalid_style');
  }
  const style: Required<Omit<QrRenderOptions, 'logo'>> = {
    width: options.width ?? 512,
    margin: options.margin ?? 4,
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'H',
    dark: options.dark ?? '#000000',
    light: options.light ?? '#ffffff',
  };
  if (!Number.isInteger(style.width) || style.width < 128 || style.width > 4096
      || !Number.isInteger(style.margin) || style.margin < 4 || style.margin > 32
      || !['L', 'M', 'Q', 'H'].includes(style.errorCorrectionLevel)
      || typeof style.dark !== 'string' || typeof style.light !== 'string'
      || !/^#[0-9a-fA-F]{6}$/.test(style.dark) || !/^#[0-9a-fA-F]{6}$/.test(style.light)) {
    throw new QrRenderError('invalid_style');
  }
  const dark = luminance(style.dark), light = luminance(style.light);
  if (dark >= light || (light + 0.05) / (dark + 0.05) < 4.5) {
    throw new QrRenderError('insufficient_contrast');
  }
  let moduleCount: number;
  try {
    moduleCount = QRCode.create(payload, { errorCorrectionLevel: style.errorCorrectionLevel }).modules.size;
  } catch {
    throw new QrRenderError('payload_too_dense');
  }
  // At least three pixels per module. Refuse an undersized export rather than
  // issuing an image whose edges collapse when downloaded or printed.
  if (style.width < (moduleCount + 2 * style.margin) * 3) {
    throw new QrRenderError('payload_too_dense');
  }
  const settings = {
    width: style.width,
    margin: style.margin,
    errorCorrectionLevel: style.errorCorrectionLevel,
    color: { dark: style.dark, light: style.light },
  };
  const [svg, png] = await Promise.all([
    QRCode.toString(payload, { ...settings, type: 'svg' }),
    QRCode.toBuffer(payload, { ...settings, type: 'png' }),
  ]);
  if (options.logo === undefined) return { svg, png, width: style.width, moduleCount, style };
  // A small central logo still is not guaranteed readable by correction level H.
  // Decode the actual exported pixels before returning either format.
  if (style.errorCorrectionLevel !== 'H' || !Buffer.isBuffer(options.logo)
      || options.logo.length > 2 * 1024 * 1024 || options.logo.length < 8
      || !(options.logo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        || options.logo.subarray(0, 3).equals(Buffer.from([255, 216, 255])))) {
    throw new QrRenderError('invalid_logo');
  }
  const coverSize = Math.floor(moduleCount / (moduleCount + 2 * style.margin) * style.width * 0.15);
  const logoSize = Math.max(1, coverSize - 4);
  let raster: Buffer;
  try {
    const image = sharp(options.logo, { limitInputPixels: 4_194_304, animated: false, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg'].includes(metadata.format ?? '') || !metadata.width || !metadata.height
        || metadata.width > 2048 || metadata.height > 2048 || (metadata.pages ?? 1) > 1) {
      throw new Error('invalid raster');
    }
    const logo = await image.rotate().resize(logoSize, logoSize, { fit: 'contain', background: style.light }).png().toBuffer();
    raster = await sharp({ create: { width: coverSize, height: coverSize, channels: 4, background: style.light } })
      .composite([{ input: logo, gravity: 'centre' }]).png().toBuffer();
  } catch {
    throw new QrRenderError('invalid_logo');
  }
  const offset = Math.floor((style.width - coverSize) / 2);
  const composite = await sharp(png).composite([{ input: raster, left: offset, top: offset }]).png().toBuffer();
  const { data, info } = await sharp(composite).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  if (decoded?.data !== payload) throw new QrRenderError('unreadable_logo');
  // SVG's QR viewBox uses module coordinates. Match the PNG pixel position
  // exactly by converting its offset and cover size back into that coordinate space.
  const total = moduleCount + 2 * style.margin;
  const svgOffset = offset / style.width * total;
  const svgSize = coverSize / style.width * total;
  const brandedSvg = svg.replace('</svg>', `<image x="${svgOffset}" y="${svgOffset}" width="${svgSize}" height="${svgSize}" href="data:image/png;base64,${raster.toString('base64')}"/></svg>`);
  return { svg: brandedSvg, png: composite, width: style.width, moduleCount, style };
}
