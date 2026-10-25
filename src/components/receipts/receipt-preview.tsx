import type { ReceiptSettings } from '@/lib/receipts/settings';
import type { ReceiptPreviewData } from '@/lib/receipts/preview';
import { renderCustomerReceiptSvg, ReceiptLayoutError, type ReceiptSvg } from '@/lib/receipts/print-layout';
import { ReceiptSvgPreview } from './receipt-svg-preview';
export { SAMPLE_RECEIPT } from '@/lib/receipts/preview';
export type { ReceiptPreviewData } from '@/lib/receipts/preview';

export function ReceiptPreview({ settings, order }: { settings: ReceiptSettings; order: ReceiptPreviewData }) {
  let document: ReceiptSvg;
  try { document = renderCustomerReceiptSvg(settings, order); } catch (error) {
    if (!(error instanceof ReceiptLayoutError)) throw error;
    return <p role="alert" className="rounded border p-3">Bonnen kan ikke vises i det valgte papirformat. Kontrollér tekstlængde og ordreindhold.</p>;
  }
  return <article aria-label="Forhåndsvisning af kvittering" data-paper-width={settings.paperWidthMm}
    className="relative mx-auto max-w-full bg-white text-black shadow-sm" style={{ width: `${settings.paperWidthMm}mm` }}>
    <ReceiptSvgPreview document={document} logoUrl={order.logoUrl} />
  </article>;
}
