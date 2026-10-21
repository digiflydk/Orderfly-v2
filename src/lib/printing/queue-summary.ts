import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { validatePrinterConfiguration } from './configuration';
import { storedPrinterSchema } from './storage';
import { readCanonicalQueueSnapshot } from './queue-snapshot';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const inputSchema = z.object({ brandId: id, locationId: id, printerId: id }).strict();
export class PrinterQueueReadError extends Error {
  constructor(readonly code: 'invalid_request' | 'not_found', readonly status: number) { super(code); }
}
/** Read-only transaction snapshot. Never a review receipt or permission to resume. */
export async function readPrinterQueueSummary(input: unknown) {
  const identity = await verifiedOrderflyIdentity();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new PrinterQueueReadError('invalid_request', 400);
  const query = parsed.data, db = getAdminDb();
  const locationRef = db.collection('locations').doc(query.locationId);
  const printerRef = locationRef.collection('printers').doc(query.printerId);
  return db.runTransaction(async tx => {
    // Policy, native ownership, printer and queue are checked in the same snapshot.
    await authorizeTransaction(tx, identity, query, 'orderfly.catalog:view', 'location');
    const [location, printer] = await Promise.all([tx.get(locationRef), tx.get(printerRef)]);
    const record = printer.exists ? storedPrinterSchema.safeParse(printer.data()) : null;
    if (!record?.success || record.data.configuration.id !== printer.id
      || !validatePrinterConfiguration(record.data.configuration,
        { brandId: query.brandId, locationId: query.locationId },
        { id: location.id, brandId: location.data()?.brandId }).ok) {
      throw new PrinterQueueReadError('not_found', 404);
    }
    return { ...query, printerState: record.data.configuration.state,
      printerRevision: record.data.revision, resumeAuthorized: false as const,
      ...await readCanonicalQueueSnapshot(tx, printerRef, query) };
  }, { readOnly: true });
}
