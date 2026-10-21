import 'server-only';
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const integer = z.number().int().nonnegative().safe();
const scope = { brandId: id, locationId: id, printerId: id };

export const PRINT_QUEUE_LIMIT = 500;

export const storedPrintQueueSchema = z.object({
  schemaVersion: z.literal(1), ...scope, revision: integer.positive(),
  pendingCount: integer, oldestPendingAt: integer.nullable(),
  updatedAt: z.unknown(),
}).strict().refine(q => (q.pendingCount === 0) === (q.oldestPendingAt === null));
export const storedQueuedPrintJobSchema = z.object({
  schemaVersion: z.literal(1), ...scope, orderId: id, kind: z.enum(['kitchen', 'packing']),
  revision: z.literal(0), id: z.string().regex(/^[a-f0-9]{64}$/),
  printerRevision: integer.positive(), state: z.literal('queued'), attempts: z.literal(0),
  createdAt: integer, updatedAt: z.unknown(),
}).strict();
