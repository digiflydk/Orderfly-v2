import 'server-only';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { validatePrinterConfiguration } from './configuration';
import { storedPrinterSchema } from './storage';
import { createPrinterDeviceCredentialDraft } from './device-auth';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().positive().safe();
const commandSchema = z.object({ operation: z.enum(['issue', 'rotate', 'revoke']), brandId: id, locationId: id,
  printerId: id, printerRevision: revision, credentialRevision: z.number().int().nonnegative().safe() }).strict();
export const credentialSchema = z.object({ schemaVersion: z.literal(1), brandId: id, locationId: id, printerId: id,
  printerRevision: revision, credentialRevision: revision, secretDigest: z.string().length(64).regex(/^[a-f0-9]+$/),
  issuedAt: revision, revokedAt: revision.nullable() }).strict();
export class PrinterDeviceCredentialWriteError extends Error {
  constructor(readonly code: 'invalid_request' | 'writes_unavailable' | 'not_found' | 'record_conflict' | 'credentials_unavailable',
    readonly status: number) { super(code); }
}
const failure = (code: ConstructorParameters<typeof PrinterDeviceCredentialWriteError>[0], status: number): never => {
  throw new PrinterDeviceCredentialWriteError(code, status);
};
function nativeScope(snapshot: FirebaseFirestore.DocumentSnapshot, expectedId: string) {
  const row = snapshot.data();
  if (!snapshot.exists || snapshot.id !== expectedId || !row || (row.id !== undefined && row.id !== expectedId)
    || ['deleted', 'isDeleted', 'isTestData'].some(key => row[key] !== undefined && row[key] !== false)
    || (row.deletedAt !== undefined && row.deletedAt !== null) || (row.isActive !== undefined && row.isActive !== true)) return failure('not_found', 404);
  return row;
}

export type PrinterDeviceCredentialWriteResult = Readonly<{
  brandId: string; locationId: string; printerId: string; printerRevision: number; credentialRevision: number;
  revoked: boolean; dispatchAuthorized: false; activationAuthorized: false; secret?: string;
}>;

/** Server-only, one-time delivery after confirmed commit. No endpoint or output authority. */
export async function writePrinterDeviceCredential(input: unknown): Promise<PrinterDeviceCredentialWriteResult> {
  const session = await requirePlatformSuperuser();
  let command: z.infer<typeof commandSchema>;
  try { command = commandSchema.parse(input); } catch { return failure('invalid_request', 400); }
  if ((command.operation === 'issue') !== (command.credentialRevision === 0)
    || command.credentialRevision === Number.MAX_SAFE_INTEGER) return failure('invalid_request', 400);
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') return failure('writes_unavailable', 503);
  const actorId = principalKey(session.identity), nextRevision = command.credentialRevision + 1;
  try {
    // Exactly once per invocation, outside the SDK retry callback. CAS binds every
    // retry, while entropy/provider failures use the fixed service error below.
    const draft = command.operation === 'revoke' ? null : createPrinterDeviceCredentialDraft({
      brandId: command.brandId, locationId: command.locationId, printerId: command.printerId,
      printerRevision: command.printerRevision, credentialRevision: nextRevision,
    });
    const db = getAdminDb(), locationRef = db.collection('locations').doc(command.locationId);
    const printerRef = locationRef.collection('printers').doc(command.printerId);
    const credentialRef = printerRef.collection('deviceCredentials').doc('current');
    const metadata = await db.runTransaction(async tx => {
      // Session is only the first boundary. Re-read platform-superuser and native
      // catalog authorization in this same transaction, including every SDK retry.
      const policy = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
      if (!policy.success || !isSuperuser(policy.data, actorId)) throw new AuthorityError('forbidden');
      await authorizeTransaction(tx, session.identity, command, 'orderfly.catalog:edit', 'location');
      const [brandSnapshot, locationSnapshot, printerSnapshot, credentialSnapshot, auditSnapshot] = await Promise.all([
        tx.get(db.collection('brands').doc(command.brandId)), tx.get(locationRef), tx.get(printerRef), tx.get(credentialRef),
        tx.get(printerRef.collection('deviceCredentialAudit').doc(String(nextRevision))),
      ]);
      const brand = nativeScope(brandSnapshot, command.brandId), location = nativeScope(locationSnapshot, command.locationId);
      if (!['active', 'pending', 'trialing'].includes(brand.status) || location.brandId !== command.brandId) return failure('not_found', 404);
      const printer = printerSnapshot.exists ? storedPrinterSchema.safeParse(printerSnapshot.data()) : null;
      if (!printer?.success || printerSnapshot.id !== command.printerId || printer.data.configuration.id !== command.printerId
        || !validatePrinterConfiguration(printer.data.configuration, { brandId: command.brandId, locationId: command.locationId }, { id: locationSnapshot.id, brandId: location.brandId }).ok) return failure('not_found', 404);
      if (printer.data.revision !== command.printerRevision || auditSnapshot.exists) return failure('record_conflict', 409);
      const now = Date.now();
      if (!Number.isSafeInteger(now) || now < 1) return failure('credentials_unavailable', 503);
      const previous = credentialSnapshot.exists ? credentialSchema.safeParse(credentialSnapshot.data()) : null;
      if (command.operation === 'issue') {
        if (credentialSnapshot.exists) return failure('record_conflict', 409);
      } else {
        if (!previous?.success || previous.data.brandId !== command.brandId || previous.data.locationId !== command.locationId
          || previous.data.printerId !== command.printerId || previous.data.printerRevision > printer.data.revision
          || previous.data.credentialRevision !== command.credentialRevision || previous.data.issuedAt > now
          || (previous.data.revokedAt !== null && (previous.data.revokedAt < previous.data.issuedAt || previous.data.revokedAt > now))) return failure('record_conflict', 409);
        if (command.operation === 'revoke' && previous.data.revokedAt !== null) return failure('record_conflict', 409);
      }
      const record = credentialSchema.parse(draft?.record ?? { ...(previous?.success ? previous.data : {}), credentialRevision: nextRevision, revokedAt: now });
      if (record.issuedAt > now) return failure('credentials_unavailable', 503);
      const timestamp = FieldValue.serverTimestamp();
      tx.create(printerRef.collection('deviceCredentialAudit').doc(String(nextRevision)), {
        schemaVersion: 1, action: `printer.credential.${command.operation}`, actorId,
        brandId: command.brandId, locationId: command.locationId, printerId: command.printerId,
        printerRevision: printer.data.revision, previousCredentialRevision: command.credentialRevision,
        credentialRevision: nextRevision, revoked: command.operation === 'revoke', createdAt: timestamp,
      });
      if (command.operation === 'issue') tx.create(credentialRef, record); else tx.set(credentialRef, record);
      return Object.freeze({ brandId: command.brandId, locationId: command.locationId, printerId: command.printerId,
        printerRevision: printer.data.revision, credentialRevision: nextRevision, revoked: command.operation === 'revoke',
        dispatchAuthorized: false as const, activationAuthorized: false as const });
    });
    // The callback returns no plaintext. SDK commit must resolve before delivery.
    return draft ? Object.freeze(Object.defineProperty({ ...metadata }, 'secret', { value: draft.secret })) : metadata;
  } catch (error) {
    if (error instanceof PrinterDeviceCredentialWriteError || error instanceof AuthorityError) throw error;
    return failure('credentials_unavailable', 503);
  }
}
