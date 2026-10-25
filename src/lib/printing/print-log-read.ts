import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { decodePrintLogCursor, encodePrintLogCursor, printLogId, PrintLogError, projectPrintLog, type PrintLogScope, type PrintLogSource } from './print-log';

// Single-field collection queries only: this reader needs no production indexes or writes.
const MAX_LOCATIONS = 50, MAX_PRINTERS = 50;
const fields = ['brandId', 'locationId', 'printerId', 'orderId', 'kind', 'createdAt', 'state', 'expiresAt', 'offeredAt', 'downloadedAt', 'completedAt', 'jobId', 'id', 'reason',
  'job.brandId', 'job.locationId', 'job.printerId', 'job.orderId', 'job.kind', 'job.createdAt'];
const safeName = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.slice(0, 160) : fallback;
export async function readPrintLog(input: { brandId: string; cursor?: string; limit?: number }) {
  await requirePlatformSuperuser();
  if (!printLogId.safeParse(input.brandId).success || !Number.isInteger(input.limit ?? 25) || (input.limit ?? 25) < 1 || (input.limit ?? 25) > 50) throw new PrintLogError('print_log_invalid', 400);
  const { brandId } = input, limit = input.limit ?? 25, cursor = decodePrintLogCursor(input.cursor, brandId), db = getAdminDb(), now = Date.now();
  const locations = await db.collection('locations').where('brandId', '==', brandId).select('brandId', 'name').limit(MAX_LOCATIONS + 1).get();
  if (locations.size > MAX_LOCATIONS) throw new PrintLogError('print_log_scope_too_large');
  const scopes: { ref: FirebaseFirestore.DocumentReference; scope: PrintLogScope }[] = [];
  for (const location of locations.docs) {
    if (location.data().brandId !== brandId || !printLogId.safeParse(location.id).success) throw new PrintLogError('print_log_unavailable');
    // Include disabled/deleted printer configurations: their history remains relevant.
    const printers = await location.ref.collection('printers').select('configuration.brandId', 'configuration.locationId', 'configuration.name').limit(MAX_PRINTERS + 1).get();
    for (const printer of printers.docs) {
      const config = printer.data().configuration;
      if (!printLogId.safeParse(printer.id).success || config?.brandId !== brandId || config?.locationId !== location.id) throw new PrintLogError('print_log_unavailable');
      scopes.push({ ref: printer.ref, scope: { brandId, locationId: location.id, locationName: safeName(location.data().name, location.id), printerId: printer.id, printerName: safeName(config.name, printer.id) } });
    }
    if (scopes.length > MAX_PRINTERS) throw new PrintLogError('print_log_scope_too_large');
  }
  const sources: PrintLogSource[] = ['jobs', 'ordinaryDispatches', 'manualPrintRequests', 'expiredPrintJobs'];
  if (cursor && !scopes.some(({ ref }) => sources.some(source => cursor.path.startsWith(`${ref.path}/${source}/`)))) throw new PrintLogError('print_log_invalid', 400);
  const batches = await Promise.all(scopes.map(async ({ ref, scope }) => {
    const pages = await Promise.all(sources.map(async source => {
      const collection = ref.collection(source), field = source === 'ordinaryDispatches' ? 'offeredAt' : 'createdAt';
      let query: FirebaseFirestore.Query = collection.orderBy(field, 'desc').orderBy('__name__', 'desc');
      if (cursor) {
        const cursorParent = cursor.path.slice(0, cursor.path.lastIndexOf('/'));
        if (cursorParent === collection.path) query = query.startAfter(cursor.at, cursor.path.slice(cursor.path.lastIndexOf('/') + 1));
        else query = query.where(field, collection.path > cursorParent ? '<' : '<=', cursor.at);
      }
      const result = await query.select(...fields).limit(limit + 1).get();
      return result.docs.map(doc => ({ source, doc, scope, at: doc.data()[field] as number, path: doc.ref.path }));
    }));
    return pages.flat();
  }));
  if (batches.flat().some(item => !Number.isSafeInteger(item.at) || item.at < 0 || item.at > 8.64e15)) throw new PrintLogError('print_log_unavailable');
  const all = batches.flat().sort((a, b) => b.at - a.at || (a.path < b.path ? 1 : a.path > b.path ? -1 : 0));
  // A dispatch supersedes its queued record even while that queued record still exists.
  // Advance by scanned records (including hidden duplicates), avoiding gaps or loops.
  const page = all.slice(0, limit), queued = page.filter(item => item.source === 'jobs' || item.source === 'expiredPrintJobs');
  const dispatched = queued.length ? await db.getAll(...queued.map(item => item.doc.ref.parent.parent!.collection('ordinaryDispatches').doc(item.doc.id)), { fieldMask: ['jobId', 'brandId', 'locationId', 'printerId'] }) : [];
  const hidden = new Set<string>();
  dispatched.forEach((doc, index) => {
    if (!doc.exists) return;
    const row = doc.data(), item = queued[index];
    if (row?.jobId !== item.doc.id || row.brandId !== brandId || row.locationId !== item.scope.locationId || row.printerId !== item.scope.printerId) throw new PrintLogError('print_log_unavailable');
    hidden.add(item.path);
  });
  const projected = page.map(item => ({ path: item.path, row: projectPrintLog(item.source, item.doc.id, item.doc.data(), item.scope, now) }));
  const items = projected.filter(item => !hidden.has(item.path)).map(item => item.row);
  const last = page[page.length - 1];
  return { items, nextCursor: all.length > limit && last ? encodePrintLogCursor({ v: 1, brandId, at: last.at, path: last.path }) : null };
}
