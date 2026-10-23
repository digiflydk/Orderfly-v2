import 'server-only';
import { createHash } from 'node:crypto';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { z } from 'zod';
import { storedQueuedPrintJobSchema } from './queue-storage';
import { storedManifestSchema } from './outbox';
import { storedPrinterSchema } from './storage';
import { projectNativePrintCatalog } from './catalog-line-projection';
import { kitchenPrintEligibility, type KitchenOrder } from './domain';
import { encodeKitchenPng } from './kitchen-png';

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
  const lines = target.lineIds.map(lineId => catalog.lines.find(row => row.lineId === lineId) ?? invalid());
  const orderReference = job.orderId.length <= 32 ? job.orderId : job.orderId.slice(-32);
  // Existing native order field records the chosen pickup/delivery label; no
  // browser timestamp, customer identity, payment data or current product text.
  if (typeof data.deliveryTime !== 'string' || !data.deliveryTime.trim() || data.deliveryTime.length > 64) return invalid();
  const note = data.customerDetails?.deliveryInstructions;
  if (note !== undefined && (typeof note !== 'string' || note.length > 400)) return invalid();
  const encoded = encodeKitchenPng({ orderReference,
    fulfillmentLabel: catalog.deliveryType === 'Pickup' ? 'Afhentning' : 'Levering', fulfillmentTime: data.deliveryTime,
    ...(typeof note === 'string' && note.trim() ? { kitchenNote: note } : {}),
    items: lines.map(line => ({ name: line.name, quantity: line.quantity,
      ...(line.modifiers?.length ? { literalModifiers: [...line.modifiers] } : {}) })),
  }, profile);
  return { payload: encoded.payload, sha256: createHash('sha256').update(encoded.payload).digest('hex') };
}
