import 'server-only';
import { z } from 'zod';

export const QUEUE_REVIEW_TTL_MS = 120_000;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const revision = z.number().int().positive().safe();
// Private capability record. Only a digest is stored; never persist the bearer token.
// lifecycle.ts parses only this unconsumed shape, then consumes it with audited
// resume atomically. A consumed record is intentionally rejected by this schema.
export const issuedQueueReviewSchema = z.object({
  schemaVersion: z.literal(1), tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  actorId: z.string().regex(/^[a-f0-9]{64}$/), brandId: id, locationId: id, printerId: id,
  printerState: z.enum(['disabled', 'paused']), printerRevision: revision, queueRevision: revision,
  decision: z.literal('resume_empty'), issuedAt: revision, expiresAt: revision,
  consumedAt: z.null(), createdAt: z.unknown(),
}).strict().refine(r => r.expiresAt - r.issuedAt === QUEUE_REVIEW_TTL_MS);
