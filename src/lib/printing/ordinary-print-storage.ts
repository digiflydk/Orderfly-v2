import 'server-only';
import { z } from 'zod';
import { printJobId } from './domain';
import { storedQueuedPrintJobSchema } from './queue-storage';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().positive().safe().max(8.64e15);
const revision = z.number().int().positive().safe();
const scope = { brandId: id, locationId: id, printerId: id };
export const originalPrintHistorySchema = z.object({ schemaVersion: z.literal(1), ...scope,
  jobId: digest, orderId: id, kind: z.enum(['kitchen', 'packing']), revision: z.literal(0),
  printerRevision: revision, credentialRevision: revision, contentDigest: digest, transferredAt: time,
}).strict().refine(row => printJobId(row) === row.jobId);

export const ordinaryDispatchSchema = z.object({ schemaVersion: z.literal(1), ...scope,
  jobId: digest, job: storedQueuedPrintJobSchema.omit({ updatedAt: true }),
  printerRevision: revision, credentialRevision: revision, qualificationId: id,
  state: z.enum(['offered', 'download_started', 'confirmed', 'failed', 'unknown']),
  claimDigest: digest, deliveryDigest: digest, contentDigest: digest,
  payloadBase64: z.string().min(12).max(349528), byteLength: z.number().int().min(8).max(262144),
  model: z.enum(['mc-print2', 'mc-print3']), paperWidthMm: z.union([z.literal(58), z.literal(80)]),
  offeredAt: time, expiresAt: time, downloadedAt: time.nullable(), completedAt: time.nullable(),
}).strict().refine(row => row.expiresAt > row.offeredAt && row.expiresAt - row.offeredAt <= 60_000
  && row.job.id === row.jobId && printJobId(row.job) === row.jobId
  && row.job.brandId === row.brandId && row.job.locationId === row.locationId && row.job.printerId === row.printerId
  && row.job.printerRevision === row.printerRevision && row.job.createdAt <= row.offeredAt
  && (row.model !== 'mc-print2' || row.paperWidthMm === 58)
  && (row.state === 'offered' ? row.downloadedAt === null && row.completedAt === null
    : row.downloadedAt !== null && row.downloadedAt >= row.offeredAt && row.downloadedAt < row.expiresAt)
  && (['confirmed', 'failed', 'unknown'].includes(row.state)
    ? row.completedAt !== null && row.completedAt >= row.downloadedAt! : row.completedAt === null));
export const ordinaryPointerSchema = z.object({ schemaVersion: z.literal(1), jobId: digest }).strict();
