import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const revision = z.number().int().positive().safe();
const time = revision.max(8.64e15);
export const orderTestBinding = { brandId: id, locationId: id, printerId: id, printerRevision: revision, credentialRevision: revision };
export const orderTestScopeSchema = z.object(orderTestBinding).strict();
export const ORDER_TEST_WINDOW_MS = 3_600_000;
export const orderTestWindowSchema = z.object({ schemaVersion: z.literal(1), ...orderTestBinding,
  qualificationId: z.string().regex(/^[A-Za-z0-9_-]{43}$/), trust: z.literal('supervised_order_test'), actorId: z.string().min(1).max(256),
  routingRevision: revision,
  model: z.enum(['mc-print2', 'mc-print3']), paperWidthMm: z.union([z.literal(58), z.literal(80)]),
  issuedAt: time, expiresAt: time, stoppedAt: time.nullable(),
  physicalPaperCheckedByOperator: z.literal(true), unattendedAuthorized: z.literal(false),
}).strict().refine(r => r.expiresAt - r.issuedAt === ORDER_TEST_WINDOW_MS
  && (r.stoppedAt === null || r.stoppedAt >= r.issuedAt)
  && (r.model !== 'mc-print2' || r.paperWidthMm === 58));
