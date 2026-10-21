import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireOrderflyAccess, verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { validatePrinterConfiguration } from './configuration';
import { storedPrinterSchema } from './storage';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const readSchema = z.object({
  brandId: identifier, locationId: identifier, printerId: identifier.optional(),
  after: identifier.optional(), model: z.enum(['mc-print2', 'mc-print3']).optional(),
  overview: z.literal('true').optional(),
  limit: z.string().regex(/^(?:[1-9]|[1-4][0-9]|50)$/).optional(),
}).strict().refine(input => !input.printerId || (!input.after && !input.limit && !input.model && !input.overview));

export class PrinterReadError extends Error {
  constructor(public code: 'invalid_request' | 'not_found' | 'printers_unavailable', public status: number) {
    super(code);
  }
}

/** Authenticated, bounded reads only. No device connection or queue side effects. */
export async function readPrinterConfigurations(input: unknown) {
  await verifiedOrderflyIdentity();
  const parsed = readSchema.safeParse(input);
  if (!parsed.success) throw new PrinterReadError('invalid_request', 400);
  const query = parsed.data;
  await requireOrderflyAccess(query.brandId, [query.locationId], 'orderfly.catalog:view');
  const locationRef = getAdminDb().collection('locations').doc(query.locationId);
  const location = await locationRef.get();
  if (!location.exists || location.data()?.brandId !== query.brandId) throw new AuthorityError('forbidden');
  const scope = { brandId: query.brandId, locationId: query.locationId };
  const locationScope = { id: location.id, brandId: location.data()!.brandId };
  const printers = locationRef.collection('printers');

  const project = (doc: FirebaseFirestore.DocumentSnapshot) => {
    const record = storedPrinterSchema.safeParse(doc.data());
    if (!record.success || record.data.configuration.id !== doc.id) return null;
    const checked = validatePrinterConfiguration(record.data.configuration, scope, locationScope);
    return checked.ok ? { configuration: checked.configuration, revision: record.data.revision } : null;
  };

  if (query.printerId) {
    const doc = await printers.doc(query.printerId).get();
    const item = doc.exists ? project(doc) : null;
    // Missing, deleted, corrupt and foreign documents have the same public result.
    if (!item) throw new PrinterReadError('not_found', 404);
    return { item };
  }

  const limit = query.limit ? Number(query.limit) : 20;
  const allPrinters = printers.where('deletedAt', '==', null);
  let filtered = allPrinters;
  if (query.model) filtered = filtered.where('configuration.model', '==', query.model);
  let page = filtered.orderBy('__name__');
  if (query.after) page = page.startAfter(query.after);
  const snapshot = await page.limit(limit + 1).get();
  const items = snapshot.docs.map(project);
  // Never serialize a malformed row or use its foreign ID in a continuation token.
  if (items.some(item => item === null)) throw new PrinterReadError('printers_unavailable', 503);
  // The scope count is independent of model filtering, pagination and current page.
  // It includes all nondeleted records, never an estimate from a partial page.
  const totalPrinters = query.overview ? (await allPrinters.count().get()).data().count : undefined;
  if (query.overview && (!Number.isSafeInteger(totalPrinters) || totalPrinters! < snapshot.docs.length)) {
    throw new PrinterReadError('printers_unavailable', 503);
  }
  return { items: items.slice(0, limit), nextCursor: snapshot.docs.length > limit ? snapshot.docs[limit - 1].id : null,
    ...(query.overview ? { totalPrinters } : {}) };
}
