import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { storedPrinterSchema } from './storage';
import { validatePrinterConfiguration } from './configuration';
import { credentialSchema } from './device-credentials-service';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const requestSchema = z.object({ brandId: id, locationId: id, printerId: id }).strict();
export class PrinterCredentialMetadataError extends Error {
  constructor(readonly code: 'invalid_request' | 'not_found' | 'credentials_unavailable', readonly status: number) { super(code); }
}
const reject = (code: 'not_found' | 'credentials_unavailable', status: number): never => { throw new PrinterCredentialMetadataError(code, status); };
function nativeScope(snapshot: FirebaseFirestore.DocumentSnapshot, expectedId: string) {
  const row = snapshot.data();
  if (!snapshot.exists || snapshot.id !== expectedId || !row || (row.id !== undefined && row.id !== expectedId)
    || ['deleted', 'isDeleted', 'isTestData'].some(key => row[key] !== undefined && row[key] !== false)
    || (row.deletedAt !== undefined && row.deletedAt !== null) || (row.isActive !== undefined && row.isActive !== true)) return reject('not_found', 404);
  return row;
}
export type PrinterCredentialMetadata = Readonly<{
  brandId: string; locationId: string; printerId: string; printerRevision: number; credentialRevision: number;
  state: 'missing' | 'current' | 'revoked' | 'stale'; dispatchAuthorized: false; activationAuthorized: false;
}>;

/** Private administration metadata only, never device or output authority. */
export async function readPrinterCredentialMetadata(input: unknown): Promise<PrinterCredentialMetadata> {
  const session = await requirePlatformSuperuser();
  let command: z.infer<typeof requestSchema>;
  try { command = requestSchema.parse(input); } catch { throw new PrinterCredentialMetadataError('invalid_request', 400); }
  try {
    const db = getAdminDb(), actorId = principalKey(session.identity);
    const locationRef = db.collection('locations').doc(command.locationId);
    const printerRef = locationRef.collection('printers').doc(command.printerId);
    return await db.runTransaction(async tx => {
      const policy = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
      if (!policy.success || !isSuperuser(policy.data, actorId)) throw new AuthorityError('forbidden');
      await authorizeTransaction(tx, session.identity, command, 'orderfly.catalog:edit', 'location');
      // Native scope precedes private printer/credential paths, even for a
      // platform superuser. Repeat this frontier on every transaction attempt.
      const [brandSnapshot, locationSnapshot] = await Promise.all([
        tx.get(db.collection('brands').doc(command.brandId)), tx.get(locationRef),
      ]);
      const brand = nativeScope(brandSnapshot, command.brandId), location = nativeScope(locationSnapshot, command.locationId);
      if (!['active', 'pending', 'trialing'].includes(brand.status) || location.brandId !== command.brandId) return reject('not_found', 404);
      const printerSnapshot = await tx.get(printerRef);
      const printer = printerSnapshot.exists ? storedPrinterSchema.safeParse(printerSnapshot.data()) : null;
      if (!printer?.success || printerSnapshot.id !== command.printerId || printer.data.configuration.id !== command.printerId
        || !validatePrinterConfiguration(printer.data.configuration, { brandId: command.brandId, locationId: command.locationId },
          { id: locationSnapshot.id, brandId: location.brandId }).ok) return reject('not_found', 404);
      const snapshot = await tx.get(printerRef.collection('deviceCredentials').doc('current'));
      let credentialRevision = 0, state: PrinterCredentialMetadata['state'] = 'missing';
      if (snapshot.exists) {
        const parsed = credentialSchema.safeParse(snapshot.data()), now = Date.now();
        if (snapshot.id !== 'current' || !parsed.success || !Number.isSafeInteger(now) || now < 1) return reject('credentials_unavailable', 503);
        const saved = parsed.data;
        if (saved.brandId !== command.brandId || saved.locationId !== command.locationId || saved.printerId !== command.printerId
          || saved.printerRevision > printer.data.revision || saved.issuedAt > now
          || (saved.revokedAt !== null && (saved.revokedAt < saved.issuedAt || saved.revokedAt > now))) return reject('credentials_unavailable', 503);
        credentialRevision = saved.credentialRevision;
        state = saved.revokedAt !== null ? 'revoked' : saved.printerRevision < printer.data.revision ? 'stale' : 'current';
      }
      return Object.freeze({ ...command, printerRevision: printer.data.revision, credentialRevision, state,
        dispatchAuthorized: false as const, activationAuthorized: false as const });
    }, { readOnly: true });
  } catch (error) {
    if (error instanceof PrinterCredentialMetadataError || error instanceof AuthorityError) throw error;
    return reject('credentials_unavailable', 503);
  }
}
