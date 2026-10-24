import 'server-only';
import { z } from 'zod';
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().positive().safe();
export const credentialSchema = z.object({ schemaVersion: z.literal(1), brandId: id, locationId: id, printerId: id,
  printerRevision: revision, credentialRevision: revision, secretDigest: z.string().length(64).regex(/^[a-f0-9]+$/),
  issuedAt: revision, revokedAt: revision.nullable() }).strict();
