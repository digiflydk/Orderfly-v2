import type { KitchenSettings } from '@/lib/receipts/kitchen-settings';
import type { KitchenPreviewData } from '@/lib/receipts/kitchen-preview';
import { renderKitchenReceiptSvg, ReceiptLayoutError, type ReceiptSvg } from '@/lib/receipts/print-layout';
import { ReceiptSvgPreview } from './receipt-svg-preview';
export { SAMPLE_KITCHEN_RECEIPT } from '@/lib/receipts/kitchen-preview';
export type { KitchenPreviewData } from '@/lib/receipts/kitchen-preview';

export function KitchenReceiptPreview({ settings, order }: { settings: KitchenSettings; order: KitchenPreviewData }) {
  let document: ReceiptSvg;
  try { document = renderKitchenReceiptSvg(settings, order); } catch (error) {
    if (!(error instanceof ReceiptLayoutError)) throw error;
    return <p role="alert" className="rounded border p-3">Bonnen kan ikke vises i det valgte papirformat. Kontrollér tekstlængde og ordreindhold.</p>;
  }
  return <article aria-label="Forhåndsvisning af køkkenbon" data-paper-width={settings.paperWidthMm}
    className="relative mx-auto max-w-full bg-white text-black shadow-sm" style={{ width: `${settings.paperWidthMm}mm` }}>
    <ReceiptSvgPreview document={document} />
  </article>;
}
