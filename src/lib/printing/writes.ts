import 'server-only';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { principalKey } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { printerConfigurationSchema, validatePrinterConfiguration } from './configuration';
import { storedPrinterSchema } from './storage';
import { initialPrinterActivity } from './activity-metadata';
import { storedPrintQueueSchema } from './queue-storage';

const createSchema = z.object({ configuration: printerConfigurationSchema }).strict();
const editSchema = createSchema.extend({ revision: z.number().int().positive().safe() }).strict();

export class PrinterWriteError extends Error {
  constructor(public code: 'invalid_request' | 'not_found' | 'record_conflict' | 'writes_unavailable', public status: number) {
    super(code);
  }
}

/** Preparatory writes only; never transitions lifecycle state or dispatches jobs. */
export async function writePrinterConfiguration(operation: 'create' | 'edit', input: unknown) {
  const identity = await verifiedOrderflyIdentity();
  const parsed = (operation === 'create' ? createSchema : editSchema).safeParse(input);
  if (!parsed.success || parsed.data.configuration.state !== 'disabled') throw new PrinterWriteError('invalid_request', 400);
  // Enable only after ACTIVE direct-client Firestore policy is independently verified.
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') throw new PrinterWriteError('writes_unavailable', 503);
  const config = parsed.data.configuration;
  const expectedRevision = 'revision' in parsed.data ? parsed.data.revision : undefined;
  const db = getAdminDb(), locationRef = db.collection('locations').doc(config.locationId);
  const ref = locationRef.collection('printers').doc(config.id);
  const actorId = principalKey(identity);

  return db.runTransaction(async tx => {
    // Reads of current grants, native brand and location are in the write transaction.
    // Do not expose record existence before this authorization succeeds.
    await authorizeTransaction(tx, identity, config, `orderfly.catalog:${operation}`, 'location');
    const location = await tx.get(locationRef);
    const scope = { brandId: config.brandId, locationId: config.locationId };
    const locationScope = { id: location.id, brandId: location.data()?.brandId };
    const checked = validatePrinterConfiguration(config, scope, locationScope);
    if (!checked.ok) throw new PrinterWriteError('invalid_request', 400);
    const saved = await tx.get(ref);
    const previous = saved.exists ? storedPrinterSchema.safeParse(saved.data()) : null;
    if (operation === 'create' && saved.exists) throw new PrinterWriteError('record_conflict', 409);
    if (operation === 'edit' && (!previous?.success || previous.data.configuration.id !== saved.id
      || !validatePrinterConfiguration(previous.data.configuration, scope, locationScope).ok)) {
      throw new PrinterWriteError('not_found', 404);
    }
    const before = previous?.success ? previous.data : null;
    if (operation === 'create') {
      // Only a genuinely unused new identity may establish a proven empty ledger.
      // Missing metadata on existing/legacy printers is never repaired here.
      const [queue, jobs] = await Promise.all([
        tx.get(ref.collection('queue').doc('state')),
        tx.get(ref.collection('jobs').limit(1)),
      ]);
      if (queue.exists || !jobs.empty) throw new PrinterWriteError('record_conflict', 409);
    }
    if (operation === 'edit' && (before!.revision !== expectedRevision
      || before!.revision === Number.MAX_SAFE_INTEGER || before!.configuration.state !== 'disabled')) {
      throw new PrinterWriteError('record_conflict', 409);
    }
    const revision = before ? before.revision + 1 : 1;
    const timestamp = FieldValue.serverTimestamp();
    const after = { schemaVersion: 1, configuration: checked.configuration, revision, deletedAt: null,
      createdAt: before?.createdAt ?? timestamp, updatedAt: timestamp };
    // Invalidate separately trusted evidence conservatively on every config revision.
    // Credentials are held elsewhere and are never read/copied into config or audit.
    tx.delete(locationRef.collection('printerCapabilityVerifications').doc(config.id));
    tx.create(ref.collection('audit').doc(String(revision)), {
      schemaVersion: 1, actorId, action: `printer.${operation}`, revision,
      before: before?.configuration ?? null, after: checked.configuration,
      capabilityInvalidated: true, createdAt: timestamp,
    });
    if (operation === 'create') {
      tx.create(ref, after);
      tx.create(ref.collection('queue').doc('state'), storedPrintQueueSchema.parse({
        schemaVersion: 1, brandId: config.brandId, locationId: config.locationId, printerId: config.id,
        revision: 1, pendingCount: 0, oldestPendingAt: null, updatedAt: timestamp,
      }));
      // Creation proves this new, never-reused native identity has no prior use.
      // Existing/legacy printers are never upgraded to "never" by an edit.
      tx.create(ref.collection('statusMetadata').doc('current'), initialPrinterActivity({
        brandId: config.brandId, locationId: config.locationId, printerId: config.id,
      }, true));
    } else tx.set(ref, after);
    return { item: { configuration: checked.configuration, revision } };
  });
}
