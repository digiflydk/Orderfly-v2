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
  logoBase64?: string;
  logoSizePercent?: number;
  moduleShape?: 'square' | 'dots' | 'rounded' | 'horizontal' | 'vertical' | 'diamond';
  cornerShape?: 'square' | 'rounded' | 'extra-rounded';
  cornerShapes?: ['square' | 'rounded' | 'extra-rounded', 'square' | 'rounded' | 'extra-rounded', 'square' | 'rounded' | 'extra-rounded'];
  cornerColor?: string;
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
  style: Required<Pick<QrRenderOptions, 'width' | 'margin' | 'errorCorrectionLevel' | 'dark' | 'light'>> & Omit<QrRenderOptions, 'logo' | 'logoBase64'>;
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
      || Object.keys(options).some(key => !['width', 'margin', 'errorCorrectionLevel', 'dark', 'light', 'logo', 'logoBase64', 'logoSizePercent', 'moduleShape', 'cornerShape', 'cornerShapes', 'cornerColor'].includes(key))) {
    throw new QrRenderError('invalid_style');
  }
  const style: Required<Pick<QrRenderOptions, 'width' | 'margin' | 'errorCorrectionLevel' | 'dark' | 'light'>> & Omit<QrRenderOptions, 'logo' | 'logoBase64'> = {
    width: options.width ?? 512,
    margin: options.margin ?? 4,
    errorCorrectionLevel: options.errorCorrectionLevel ?? 'H',
    dark: options.dark ?? '#000000',
    light: options.light ?? '#ffffff',
    ...(options.logoSizePercent !== undefined ? { logoSizePercent: options.logoSizePercent } : {}),
    ...(options.moduleShape ? { moduleShape: options.moduleShape } : {}),
    ...(options.cornerShape ? { cornerShape: options.cornerShape } : {}),
    ...(options.cornerShapes ? { cornerShapes: options.cornerShapes } : {}),
    ...(options.cornerColor ? { cornerColor: options.cornerColor } : {}),
  };
  if (!Number.isInteger(style.width) || style.width < 128 || style.width > 4096
      || !Number.isInteger(style.margin) || style.margin < 4 || style.margin > 32
      || !['L', 'M', 'Q', 'H'].includes(style.errorCorrectionLevel)
      || typeof style.dark !== 'string' || typeof style.light !== 'string'
      || !/^#[0-9a-fA-F]{6}$/.test(style.dark) || !/^#[0-9a-fA-F]{6}$/.test(style.light)) {
    throw new QrRenderError('invalid_style');
  }
  if (style.logoSizePercent !== undefined && (!Number.isInteger(style.logoSizePercent) || style.logoSizePercent < 15 || style.logoSizePercent > 30)) throw new QrRenderError('invalid_style');
  if (style.moduleShape && !['square','dots','rounded','horizontal','vertical','diamond'].includes(style.moduleShape)
      || style.cornerShape && !['square','rounded','extra-rounded'].includes(style.cornerShape)
      || style.cornerShapes && (!Array.isArray(style.cornerShapes) || style.cornerShapes.length !== 3 || style.cornerShapes.some(v => !['square','rounded','extra-rounded'].includes(v)))
      || style.cornerColor && !/^#[0-9a-fA-F]{6}$/.test(style.cornerColor)) throw new QrRenderError('invalid_style');
  if (style.cornerColor && ((luminance(style.light) + .05) / (luminance(style.cornerColor) + .05) < 4.5 || luminance(style.cornerColor) >= luminance(style.light))) throw new QrRenderError('insufficient_contrast');
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
  let [svg, png] = await Promise.all([
    QRCode.toString(payload, { ...settings, type: 'svg' }),
    QRCode.toBuffer(payload, { ...settings, type: 'png' }),
  ]);
  const custom = !!(style.moduleShape && style.moduleShape !== 'square' || style.cornerShape && style.cornerShape !== 'square' || style.cornerShapes || style.cornerColor);
  if (custom) {
    const matrix = QRCode.create(payload, { errorCorrectionLevel: style.errorCorrectionLevel }).modules;
    const total = moduleCount + 2 * style.margin;
    const origins = [[0,0],[moduleCount-7,0],[0,moduleCount-7]];
    const finder = (x:number,y:number) => origins.some(([ox,oy]) => x>=ox && x<ox+7 && y>=oy && y<oy+7);
    const parts:string[] = [];
    for(let y=0;y<moduleCount;y++) for(let x=0;x<moduleCount;x++) {
      if(!matrix.get(y,x) || finder(x,y)) continue;
      const px=x+style.margin,py=y+style.margin;
      // Keep timing/alignment/format/version modules intact.
      const shape=matrix.isReserved(y,x)?'square':style.moduleShape;
      if(shape==='dots') parts.push(`<circle cx="${px+.5}" cy="${py+.5}" r="0.49"/>`);
      else if(shape==='diamond') parts.push(`<path d="M${px+.5} ${py}l.5 .5-.5 .5-.5-.5Z"/>`);
      else if(shape==='rounded') parts.push(`<rect x="${px}" y="${py}" width="1" height="1" rx=".28"/>`);
      else if(shape==='horizontal') parts.push(`<rect x="${px}" y="${py+.06}" width="1" height=".88" rx=".22"/>`);
      else if(shape==='vertical') parts.push(`<rect x="${px+.06}" y="${py}" width=".88" height="1" rx=".22"/>`);
      else parts.push(`<rect x="${px}" y="${py}" width="1" height="1"/>`);
    }
    const eyes=origins.map(([x,y],i)=>{
      const shape=style.cornerShapes?.[i]??style.cornerShape??'square';
      const radius=shape==='square'?0:shape==='rounded'?1:2;
      const px=x+style.margin,py=y+style.margin;
      return `<g fill="${style.cornerColor??style.dark}"><rect x="${px}" y="${py}" width="7" height="7" rx="${radius}"/><rect x="${px+1}" y="${py+1}" width="5" height="5" rx="${Math.max(0,radius-.5)}" fill="${style.light}"/><rect x="${px+2}" y="${py+2}" width="3" height="3" rx="${radius/2}"/></g>`;
    }).join('');
    svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${style.width}" height="${style.width}" viewBox="0 0 ${total} ${total}"><rect width="${total}" height="${total}" fill="${style.light}"/><g fill="${style.dark}">${parts.join('')}</g>${eyes}</svg>`;
    png=await sharp(Buffer.from(svg)).png().toBuffer();
  }
  const logo = options.logo ?? (options.logoBase64 ? Buffer.from(await normalizeQrLogo(options.logoBase64), 'base64') : undefined);
  if (logo === undefined) {
    if(custom) await assertReadable(png,payload);
    return { svg, png, width: style.width, moduleCount, style };
  }
  // A small central logo still is not guaranteed readable by correction level H.
  // Decode the actual exported pixels before returning either format.
  if (style.errorCorrectionLevel !== 'H' || !Buffer.isBuffer(logo)
      || logo.length > 2 * 1024 * 1024 || logo.length < 8
      || !(logo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        || logo.subarray(0, 3).equals(Buffer.from([255, 216, 255])))) {
    throw new QrRenderError('invalid_logo');
  }
  const coverSize = Math.floor(moduleCount / (moduleCount + 2 * style.margin) * style.width * (style.logoSizePercent ?? 15) / 100);
  const logoSize = Math.max(1, coverSize - 4);
  let raster: Buffer;
  try {
    const image = sharp(logo, { limitInputPixels: 4_194_304, animated: false, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg'].includes(metadata.format ?? '') || !metadata.width || !metadata.height
        || metadata.width > 2048 || metadata.height > 2048 || (metadata.pages ?? 1) > 1) {
      throw new Error('invalid raster');
    }
    const resizedLogo = await image.rotate().resize(logoSize, logoSize, { fit: 'contain', background: style.light }).png().toBuffer();
    raster = await sharp({ create: { width: coverSize, height: coverSize, channels: 4, background: style.light } })
      .composite([{ input: resizedLogo, gravity: 'centre' }]).png().toBuffer();
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

async function assertReadable(png:Buffer,payload:string) {
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data!==payload) throw new QrRenderError('unreadable_logo');
}
/** Only a small re-encoded raster is persisted, keeping records/receipts below Firestore limits. */
export async function normalizeQrLogo(base64:string):Promise<string> {
  if(typeof base64!=='string' || base64.length>2796204 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new QrRenderError('invalid_logo');
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length>2097152 || bytes.toString('base64')!==base64) throw new QrRenderError('invalid_logo');
  try {
    const image=sharp(bytes,{limitInputPixels:4194304,animated:false,failOn:'warning'}),m=await image.metadata();
    if(!['png','jpeg'].includes(m.format??'') || !m.width || !m.height || m.width>2048 || m.height>2048 || (m.pages??1)>1) throw Error();
    const result=await image.rotate().resize(256,256,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
    if(result.length>96000) throw Error();
    return result.toString('base64');
  } catch { throw new QrRenderError('invalid_logo'); }
}
