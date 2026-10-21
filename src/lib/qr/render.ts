import * as QRCode from 'qrcode';

export type QrRenderOptions = {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  dark?: string;
  light?: string;
};

export type QrRenderErrorCode = 'invalid_payload' | 'invalid_style' | 'insufficient_contrast' | 'payload_too_dense';

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
  style: Required<QrRenderOptions>;
};

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

/** Server-side export only. No fetch, logo loading, storage or tracking occurs here. */
export async function renderQr(payload: string, options: QrRenderOptions = {}): Promise<RenderedQr> {
  // Bound work before QRCode.create; reject malformed UTF-16 rather than silently
  // replacing it, so a download can never encode different content from preview.
  if (typeof payload !== 'string' || !payload.trim() || Buffer.byteLength(payload, 'utf8') > 2048
      || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(payload)) {
    throw new QrRenderError('invalid_payload');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['width', 'margin', 'errorCorrectionLevel', 'dark', 'light'].includes(key))) {
    throw new QrRenderError('invalid_style');
  }
  const style: Required<QrRenderOptions> = {
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
  return { svg, png, width: style.width, moduleCount, style };
}
