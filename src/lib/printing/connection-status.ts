import 'server-only';
import { z } from 'zod';
import type { NativePrinterDeviceIdentitySnapshot } from './device-auth-native';
import { credentialSchema } from './device-credential-schema';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const connectionSchema = z.object({ schemaVersion: z.literal(1), brandId: id, locationId: id, printerId: id,
  printerRevision: z.number().int().positive().safe(), credentialRevision: z.number().int().positive().safe(),
  lastSeenAt: z.number().int().positive().safe(), endpoint: z.enum(['test', 'live']),
}).strict();
/** Only called after fresh native authentication, in that same write transaction. */
export async function recordPrinterContact(tx: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore,
  identity: NativePrinterDeviceIdentitySnapshot, endpoint: 'test' | 'live', now = Date.now()) {
  const ref = db.collection('locations').doc(identity.locationId).collection('printers').doc(identity.printerId).collection('connection').doc('current');
  const saved = await tx.get(ref), previous = connectionSchema.safeParse(saved.data());
  if (previous.success && previous.data.brandId === identity.brandId && previous.data.locationId === identity.locationId
    && previous.data.printerId === identity.printerId && previous.data.printerRevision === identity.printerRevision
    && previous.data.credentialRevision === identity.credentialRevision && previous.data.endpoint === endpoint
    && now >= previous.data.lastSeenAt && now - previous.data.lastSeenAt < 30_000) return;
  tx.set(ref, connectionSchema.parse({ schemaVersion: 1, brandId: identity.brandId, locationId: identity.locationId,
    printerId: identity.printerId, printerRevision: identity.printerRevision, credentialRevision: identity.credentialRevision, lastSeenAt: now, endpoint }));
}
export function projectPrinterConnection(value: unknown, credential: unknown,
  scope: { brandId: string; locationId: string; printerId: string }, revision: number, now = Date.now()) {
  const p = connectionSchema.safeParse(value), c = credentialSchema.safeParse(credential);
  const belongs = p.success && p.data.brandId === scope.brandId && p.data.locationId === scope.locationId && p.data.printerId === scope.printerId;
  if (!belongs || p.data.lastSeenAt > now) return { connected: false, lastSeenAt: null, endpoint: null, checkedAt: now };
  const current = c.success && c.data.brandId === scope.brandId && c.data.locationId === scope.locationId && c.data.printerId === scope.printerId
    && c.data.printerRevision === revision && c.data.credentialRevision === p.data.credentialRevision && c.data.revokedAt === null && c.data.issuedAt <= now;
  return { connected: !!current && p.data.printerRevision === revision && now - p.data.lastSeenAt <= 90_000,
    lastSeenAt: p.data.lastSeenAt, endpoint: p.data.endpoint, checkedAt: now };
}
