import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const revision = z.number().int().positive().safe();
const instant = revision.max(8.64e15);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const directTestScopeSchema = z.object({ brandId: id, locationId: id, printerId: id,
  printerRevision: revision, credentialRevision: revision }).strict();
export const directTestCommandSchema = directTestScopeSchema.extend({ requestId: token, replaceExpiredCreatedAt: instant.optional() }).strict();
/** An administrator requested fixed test content. This is NOT hardware attestation. */
export const directTestSessionSchema = directTestScopeSchema.extend({ schemaVersion: z.literal(2),
  sessionId: token, jobId: token, actorId: z.string().min(1).max(256), state: z.literal('consumed'),
  trust: z.literal('admin_test_request'), issuedAt: instant, consumedAt: instant, expiresAt: instant,
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/), physicalCompatibilityVerified: z.literal(false),
}).strict().refine(r => r.sessionId === r.jobId && r.issuedAt === r.consumedAt && r.expiresAt - r.issuedAt === 600_000);
export const directTestResultSchema = directTestScopeSchema.extend({ jobId: token, physicalCompatibilityVerified: z.literal(false) }).strict();
