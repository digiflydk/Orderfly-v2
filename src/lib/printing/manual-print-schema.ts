import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const revision = z.number().int().positive().safe();
const instant = revision.max(8.64e15);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const MANUAL_PRINT_TTL_MS = 600_000;
export const MANUAL_PRINT_MAX_BYTES = 524_288;
export const manualPrintCommandSchema = z.object({
  orderId: id, brandId: id, locationId: id, printerId: id, printerRevision: revision,
  kind: z.enum(['kitchen', 'customer']), requestId: z.string().uuid(),
}).strict();
export const manualPrintStateSchema = z.enum(['queued', 'offered', 'download_started', 'confirmed', 'failed', 'unknown', 'expired']);
export const storedManualPrintJobSchema = manualPrintCommandSchema.extend({
  schemaVersion: z.literal(1), jobId: z.string().uuid(), credentialRevision: revision,
  actorId: z.string().min(1).max(256), createdAt: instant, expiresAt: instant,
  state: manualPrintStateSchema, payloadBase64: z.string().min(12).max(699_052),
  sha256: digest, byteLength: revision.max(MANUAL_PRINT_MAX_BYTES),
  offeredAt: instant.nullable(), downloadedAt: instant.nullable(), completedAt: instant.nullable(),
  tokenDigest: digest.nullable(),
}).strict().refine(row => {
  if (row.jobId !== row.requestId || row.expiresAt - row.createdAt !== MANUAL_PRINT_TTL_MS
    || (row.offeredAt === null) !== (row.tokenDigest === null)
    || (row.offeredAt !== null && row.offeredAt < row.createdAt)
    || (row.downloadedAt !== null && (row.offeredAt === null || row.downloadedAt < row.offeredAt))
    || (row.completedAt !== null && row.completedAt < (row.downloadedAt ?? row.offeredAt ?? row.createdAt))) return false;
  switch (row.state) {
    case 'queued': return row.offeredAt === null && row.downloadedAt === null && row.completedAt === null;
    case 'offered': return row.offeredAt !== null && row.downloadedAt === null && row.completedAt === null;
    case 'download_started': return row.downloadedAt !== null && row.completedAt === null;
    case 'confirmed': case 'failed': case 'unknown': return row.downloadedAt !== null && row.completedAt !== null;
    // Expiry can be recorded after the deadline. A downloaded receipt is unknown,
    // never expired: it may already have reached paper.
    case 'expired': return row.downloadedAt === null && row.completedAt !== null;
  }
}, 'Invalid manual print lifecycle');
export const manualPrintPointerSchema = z.object({ schemaVersion: z.literal(1), requestId: z.string().uuid() }).strict();
export const manualPrintResultSchema = manualPrintCommandSchema.extend({
  jobId: z.string().uuid(), state: manualPrintStateSchema, createdAt: instant, expiresAt: instant,
}).strict();
export type ManualPrintCommand = z.infer<typeof manualPrintCommandSchema>;
export type ManualPrintJob = z.infer<typeof storedManualPrintJobSchema>;
export class ManualPrintError extends Error {
  constructor(readonly code: 'manual_print_invalid' | 'manual_print_conflict' | 'manual_print_unavailable') { super(code); }
}
/** Read-only projection never exposes receipt content or device credentials. */
export function projectManualPrint(job: ManualPrintJob, now = Date.now()) {
  let state = job.state;
  const deadline = job.offeredAt === null ? job.expiresAt : Math.min(job.expiresAt, job.offeredAt + 60_000);
  if (now >= deadline && ['queued', 'offered'].includes(state)) state = 'expired';
  if (now >= deadline && state === 'download_started') state = 'unknown';
  return manualPrintResultSchema.parse({ orderId: job.orderId, brandId: job.brandId, locationId: job.locationId,
    printerId: job.printerId, printerRevision: job.printerRevision, kind: job.kind, requestId: job.requestId,
    jobId: job.jobId, state, createdAt: job.createdAt, expiresAt: job.expiresAt });
}
