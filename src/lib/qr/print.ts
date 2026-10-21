import type { RenderedQr } from './render';

export type QrPrintOptions = { title?: string; caption?: string; sizeMm?: number };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Self-contained browser print document, including browser Save as PDF. */
export function qrPrintHtml(qr: RenderedQr, options: QrPrintOptions = {}): string {
  if (!options || typeof options !== 'object' || Array.isArray(options)
      || Object.keys(options).some(key => !['title', 'caption', 'sizeMm'].includes(key))) throw new Error('invalid_print_options');
  const { title = '', caption = '', sizeMm = 60 } = options;
  if (typeof title !== 'string' || typeof caption !== 'string' || title.length > 250 || caption.length > 500
      || !Number.isFinite(sizeMm) || sizeMm < 25 || sizeMm > 150
      || !qr || !Buffer.isBuffer(qr.png) || qr.png.length > 10 * 1024 * 1024
      || !Number.isInteger(qr.width) || qr.width < 128 || qr.width > 4096
      || !qr.png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || !Number.isInteger(qr.moduleCount) || qr.moduleCount < 21 || qr.moduleCount > 177
      || !Number.isInteger(qr.style?.margin) || qr.style.margin < 4 || qr.style.margin > 32
      || sizeMm / (qr.moduleCount + 2 * qr.style.margin) < 0.4) throw new Error('invalid_print_options');
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'"><title>${escapeHtml(title || 'QR-kode')}</title><style>@page{margin:10mm}*{box-sizing:border-box}body{margin:0;padding:10mm;font-family:Arial,sans-serif;color:#000;background:#fff;text-align:center}main{break-inside:avoid}h1{font-size:20pt;overflow-wrap:anywhere}p{font-size:12pt;overflow-wrap:anywhere}img{display:block;margin:5mm auto;width:${sizeMm}mm;height:${sizeMm}mm;max-width:none;image-rendering:pixelated}@media print{body{padding:0}}</style></head><body><main>${title ? `<h1>${escapeHtml(title)}</h1>` : ''}<img src="data:image/png;base64,${qr.png.toString('base64')}" width="${qr.width}" height="${qr.width}" alt="QR-kode">${caption ? `<p>${escapeHtml(caption)}</p>` : ''}</main></body></html>`;
}
