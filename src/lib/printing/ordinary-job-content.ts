import 'server-only';
import { createHash } from 'node:crypto';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { z } from 'zod';
import { storedQueuedPrintJobSchema } from './queue-storage';
import { storedManifestSchema } from './outbox';
import { storedPrinterSchema } from './storage';
import { projectNativePrintCatalog } from './catalog-line-projection';
import { kitchenPrintEligibility, type KitchenOrder } from './domain';
import { prepareKitchenPrintSnapshot } from './receipt-print-content';
import { renderKitchenReceiptSvg } from '@/lib/receipts/print-layout';
import { rasterizeReceipt } from '@/lib/receipts/print-raster';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = (): never => { throw new Error('ordinary_content_unavailable'); };
/** The accepted manifest hashes the server's original product selection. Re-read
 * it natively, reject changes, and freeze exactly these PNG bytes at offer time.
 * This first supervised purchase slice supports product lines, not combo menus.
 */
export async function prepareOrdinaryJobContent(context: NativeTransactionContext,
  job: z.infer<typeof storedQueuedPrintJobSchema>, profile: { model: 'mc-print2' | 'mc-print3'; paperWidthMm: 58 | 80 }) {
  if (job.kind !== 'kitchen') return invalid();
  const { db, transaction: tx } = context;
  const orderRef = db.collection('orders').doc(job.orderId);
  const [order, manifestRow, printerRow, catalog] = await Promise.all([
    tx.get(orderRef), tx.get(orderRef.collection('printIntents').doc('original')),
    tx.get(db.collection('locations').doc(job.locationId).collection('printers').doc(job.printerId)),
    projectNativePrintCatalog(context, { orderId: job.orderId, brandId: job.brandId, locationId: job.locationId }),
  ]);
  const manifest = storedManifestSchema.safeParse(manifestRow.data()), printer = storedPrinterSchema.safeParse(printerRow.data());
  const data = order.data();
  if (!order.exists || order.id !== job.orderId || !data || !manifest.success || !printer.success
    || manifest.data.orderId !== job.orderId || manifest.data.brandId !== job.brandId || manifest.data.locationId !== job.locationId
    || manifest.data.createdAt > job.createdAt || manifest.data.catalogHash !== hash(catalog)
    || printer.data.revision !== job.printerRevision || printer.data.configuration.model !== profile.model
    || printer.data.configuration.paperWidthMm !== profile.paperWidthMm
    || !kitchenPrintEligibility({ ...data, id: order.id } as KitchenOrder, printer.data.configuration).eligible) return invalid();
  const target = manifest.data.targets.find(row => row.printerId === job.printerId);
  if (!target || target.printerRevision !== job.printerRevision || !target.kinds.includes('kitchen')
    || target.configurationHash !== hash(printer.data.configuration) || new Set(target.lineIds).size !== target.lineIds.length) return invalid();
  target.lineIds.forEach(lineId => { if (!catalog.lines.some(row => row.lineId === lineId)) return invalid(); });
  const snapshot = await prepareKitchenPrintSnapshot(context, { orderId: job.orderId, brandId: job.brandId,
    locationId: job.locationId, printerId: job.printerId, lineIds: target.lineIds });
  // Pure local raster work, no network inside this transaction. Same design,
  // settings and saved food selections as the order's online kitchen preview.
  return rasterizeReceipt(renderKitchenReceiptSvg(snapshot.settings, snapshot.order));
}
