import 'server-only';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { principalKey } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { validatePrinterConfiguration } from './configuration';
import { storedPrinterSchema } from './storage';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const commandSchema = z.object({
  brandId: identifier, locationId: identifier, printerId: identifier,
  revision: z.number().int().positive().safe(),
  action: z.enum(['pause', 'deactivate', 'delete', 'resume']),
}).strict();

export class PrinterLifecycleError extends Error {
  constructor(public code: 'invalid_request' | 'not_found' | 'record_conflict'
    | 'writes_unavailable' | 'queue_review_required', public status: number) { super(code); }
}

/** Stop transitions only. Never modifies jobs, dispatches or enables output. */
export async function transitionPrinter(input: unknown) {
  const identity = await verifiedOrderflyIdentity();
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) throw new PrinterLifecycleError('invalid_request', 400);
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') throw new PrinterLifecycleError('writes_unavailable', 503);
  const command = parsed.data;
  const db = getAdminDb(), locationRef = db.collection('locations').doc(command.locationId);
  const ref = locationRef.collection('printers').doc(command.printerId);
  const actorId = principalKey(identity);
  return db.runTransaction(async tx => {
    await authorizeTransaction(tx, identity, command,
      command.action === 'delete' ? 'orderfly.catalog:delete' : 'orderfly.catalog:edit', 'location');
    const location = await tx.get(locationRef);
    const saved = await tx.get(ref);
    const record = saved.exists ? storedPrinterSchema.safeParse(saved.data()) : null;
    if (!record?.success || record.data.configuration.id !== saved.id
      || !validatePrinterConfiguration(record.data.configuration,
        { brandId: command.brandId, locationId: command.locationId },
        { id: location.id, brandId: location.data()?.brandId }).ok) {
      throw new PrinterLifecycleError('not_found', 404);
    }
    const before = record.data;
    if (before.revision !== command.revision || before.revision === Number.MAX_SAFE_INTEGER) {
      throw new PrinterLifecycleError('record_conflict', 409);
    }
    // #300/#301 must provide an authoritative queue-age review before any resume.
    // A client boolean, missing queue or a paused/disabled record is not evidence.
    if (command.action === 'resume') throw new PrinterLifecycleError('queue_review_required', 409);
    if (command.action === 'pause' && before.configuration.state !== 'active'
      || command.action === 'deactivate' && before.configuration.state === 'disabled') {
      throw new PrinterLifecycleError('record_conflict', 409);
    }
    const revision = before.revision + 1, timestamp = FieldValue.serverTimestamp();
    const configuration = { ...before.configuration, state: command.action === 'pause' ? 'paused' as const : 'disabled' as const };
    const deleted = command.action === 'delete';
    tx.delete(locationRef.collection('printerCapabilityVerifications').doc(command.printerId));
    tx.create(ref.collection('audit').doc(String(revision)), {
      schemaVersion: 1, actorId, action: `printer.${command.action}`, revision,
      before: before.configuration, after: configuration, deleted,
      capabilityInvalidated: true, createdAt: timestamp,
    });
    tx.set(ref, { ...before, configuration, revision,
      deletedAt: deleted ? timestamp : null, updatedAt: timestamp });
    // A tombstone preserves the printer identity, audit children and all job references.
    return deleted ? { deleted: true, printerId: command.printerId, revision }
      : { item: { configuration, revision } };
  });
}
