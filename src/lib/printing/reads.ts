import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireOrderflyAccess, verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { validatePrinterConfiguration } from './configuration';
import { storedPrinterSchema } from './storage';
import { projectPrinterConnection } from './connection-status';
import { projectPrinterActivity } from './activity-metadata';

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
  const database = getAdminDb();
  const locationRef = database.collection('locations').doc(query.locationId);
  const scope = { brandId: query.brandId, locationId: query.locationId };

  const readLocationScope = (location: FirebaseFirestore.DocumentSnapshot) => {
    if (!location.exists || location.data()?.brandId !== query.brandId) throw new AuthorityError('forbidden');
    return { id: location.id, brandId: location.data()!.brandId };
  };
  const project = (doc: FirebaseFirestore.DocumentSnapshot, locationScope: { id: string; brandId: string }) => {
    const record = storedPrinterSchema.safeParse(doc.data());
    if (!record.success || record.data.configuration.id !== doc.id) return null;
    const checked = validatePrinterConfiguration(record.data.configuration, scope, locationScope);
    return checked.ok ? { configuration: checked.configuration, revision: record.data.revision } : null;
  };

  if (query.printerId) {
    const locationScope = readLocationScope(await locationRef.get());
    const printers = locationRef.collection('printers');
    const doc = await printers.doc(query.printerId).get();
    const item = doc.exists ? project(doc, locationScope) : null;
    // Missing, deleted, corrupt and foreign documents have the same public result.
    if (!item) throw new PrinterReadError('not_found', 404);
    return { item };
  }

  const limit = query.limit ? Number(query.limit) : 20;
  const buildQueries = () => {
    const printers = locationRef.collection('printers');
    const allPrinters = printers.where('deletedAt', '==', null);
    let filtered = allPrinters;
    if (query.model) filtered = filtered.where('configuration.model', '==', query.model);
    let page = filtered.orderBy('__name__');
    if (query.after) page = page.startAfter(query.after);
    return { printers, allPrinters, pageQuery: page.limit(limit + 1) };
  };

  if (query.overview) {
    return database.runTransaction(async transaction => {
      const locationScope = readLocationScope(await transaction.get(locationRef));
      const { printers, allPrinters, pageQuery } = buildQueries();
      const snapshot = await transaction.get(pageQuery);
      const items = snapshot.docs.map(doc => project(doc, locationScope));
      // Never serialize a malformed row or use its foreign ID in a continuation token.
      if (items.some(item => item === null)) throw new PrinterReadError('printers_unavailable', 503);
      // Count, page and activity documents share one native read snapshot. A concurrent resume can therefore
      // never mix a pre-resume printer revision with post-resume activation metadata.
      const countSnapshot = await transaction.get(allPrinters.where('configuration.brandId', '==', query.brandId)
        .where('configuration.locationId', '==', query.locationId).count());
      const totalPrinters = countSnapshot.data().count;
      if (!Number.isSafeInteger(totalPrinters) || totalPrinters < snapshot.docs.length) {
        throw new PrinterReadError('printers_unavailable', 503);
      }
      const visibleItems = items.slice(0, limit);
      const activityRefs = visibleItems.map(item => printers.doc(item!.configuration.id)
        .collection('statusMetadata').doc('current'));
      const activitySnapshots = activityRefs.length ? await transaction.getAll(...activityRefs) : [];
      const connectionRefs = visibleItems.flatMap(item => [printers.doc(item!.configuration.id).collection('connection').doc('current'),
        printers.doc(item!.configuration.id).collection('deviceCredentials').doc('current')]);
      const connections = connectionRefs.length ? await transaction.getAll(...connectionRefs) : [];
      return { items: visibleItems.map((item, index) => ({ ...item!,
        connection: projectPrinterConnection(connections[index * 2]?.data(), connections[index * 2 + 1]?.data(),
          { ...scope, printerId: item!.configuration.id }, item!.revision),
        activity: projectPrinterActivity(activitySnapshots[index]?.exists ? activitySnapshots[index].data() : undefined,
          { ...scope, printerId: item!.configuration.id }, item!.revision) })),
      nextCursor: snapshot.docs.length > limit ? snapshot.docs[limit - 1].id : null, totalPrinters };
    }, { readOnly: true });
  }

  const locationScope = readLocationScope(await locationRef.get());
  const { pageQuery } = buildQueries();
  const snapshot = await pageQuery.get();
  const items = snapshot.docs.map(doc => project(doc, locationScope));
  if (items.some(item => item === null)) throw new PrinterReadError('printers_unavailable', 503);
  return { items: items.slice(0, limit), nextCursor: snapshot.docs.length > limit ? snapshot.docs[limit - 1].id : null };
}
