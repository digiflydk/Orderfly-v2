import { z } from 'zod';

export const printLogId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const instant = z.number().int().nonnegative().safe().max(8.64e15);
const state = z.enum(['queued', 'offered', 'download_started', 'confirmed', 'failed', 'unknown', 'expired']);
const scope = { brandId: printLogId, locationId: printLogId, printerId: printLogId };
const base = z.object({ ...scope, orderId: printLogId, kind: z.enum(['kitchen', 'customer', 'packing']), createdAt: instant });
const manual = base.extend({ state, expiresAt: instant, offeredAt: instant.nullable(), downloadedAt: instant.nullable(), completedAt: instant.nullable(), jobId: printLogId });
const ordinary = z.object({ ...scope, jobId: printLogId, state: state.exclude(['queued', 'expired']), job: base,
  offeredAt: instant, expiresAt: instant, downloadedAt: instant.nullable(), completedAt: instant.nullable() });
const queued = base.extend({ id: printLogId, state: z.literal('queued') });
export type PrintLogSource = 'jobs' | 'ordinaryDispatches' | 'manualPrintRequests';
export type PrintLogScope = { brandId: string; locationId: string; printerId: string; locationName: string; printerName: string };
export type PrintLogItem = {
  id: string; brandId: string; locationId: string; locationName: string; printerId: string; printerName: string;
  orderId: string; kind: 'kitchen' | 'customer' | 'packing'; source: 'automatic' | 'manual';
  status: z.infer<typeof state>; createdAt: number; updatedAt: number; error: string | null;
};
export class PrintLogError extends Error {
  constructor(public code: 'print_log_invalid' | 'print_log_unavailable' | 'print_log_scope_too_large', public status = 503) { super(code); }
}
function matches(row: { brandId: string; locationId: string; printerId: string }, expected: PrintLogScope) {
  return row.brandId === expected.brandId && row.locationId === expected.locationId && row.printerId === expected.printerId;
}
/** Whitelist projection: no payload, token, actor or customer data can reach the client. */
export function projectPrintLog(source: PrintLogSource, id: string, raw: unknown, expected: PrintLogScope, now: number): PrintLogItem {
  const fail = (): never => { throw new PrintLogError('print_log_unavailable'); };
  let row: z.infer<typeof base>, status: z.infer<typeof state>, updatedAt: number;
  if (source === 'jobs') {
    const parsed = queued.safeParse(raw); if (!parsed.success || parsed.data.id !== id) return fail();
    row = parsed.data; status = 'queued'; updatedAt = row.createdAt;
  } else {
    const parsed = source === 'manualPrintRequests' ? manual.safeParse(raw) : ordinary.safeParse(raw);
    if (!parsed.success || parsed.data.jobId !== id || !matches(parsed.data, expected)) return fail();
    const record = parsed.data;
    row = 'job' in record ? record.job : record;
    status = record.state;
    if (record.expiresAt <= row.createdAt
      || (record.offeredAt !== null && record.offeredAt < row.createdAt)
      || (record.downloadedAt !== null && (record.offeredAt === null || record.downloadedAt < record.offeredAt || record.downloadedAt >= record.expiresAt))
      || (record.completedAt !== null && record.completedAt < (record.downloadedAt ?? record.offeredAt ?? row.createdAt))) return fail();
    if (status === 'queued' && (record.offeredAt !== null || record.downloadedAt !== null || record.completedAt !== null)) return fail();
    if (status === 'offered' && (record.offeredAt === null || record.downloadedAt !== null || record.completedAt !== null)) return fail();
    if (status === 'download_started' && (record.downloadedAt === null || record.completedAt !== null)) return fail();
    if (['confirmed', 'failed', 'unknown'].includes(status) && (record.downloadedAt === null || record.completedAt === null)) return fail();
    if (status === 'expired' && (record.downloadedAt !== null || record.completedAt === null)) return fail();
    const deadline = record.offeredAt === null ? record.expiresAt : Math.min(record.expiresAt, record.offeredAt + 60_000);
    if (now >= deadline && (status === 'queued' || status === 'offered')) status = 'expired';
    if (now >= deadline && status === 'download_started') status = 'unknown';
    updatedAt = record.completedAt ?? record.downloadedAt ?? record.offeredAt ?? row.createdAt;
    if (status !== record.state) updatedAt = deadline;
    if (status === 'confirmed' && (record.completedAt === null || record.downloadedAt === null)) return fail();
  }
  if (!matches(row, expected)) return fail();
  const error = status === 'failed' ? 'Printeren har meldt fejl.' : status === 'unknown' ? 'Printresultatet er ukendt. Kontrollér printeren før et eventuelt genprint.'
    : status === 'expired' ? 'Printjobbet udløb uden bekræftet overførsel.' : null;
  return { id: `${expected.locationId}/${expected.printerId}/${source}/${id}`, ...expected, orderId: row.orderId,
    kind: row.kind, source: source === 'manualPrintRequests' ? 'manual' : 'automatic', status,
    createdAt: row.createdAt, updatedAt, error };
}

const cursorSchema = z.object({ v: z.literal(1), brandId: printLogId, at: instant,
  path: z.string().regex(/^locations\/[A-Za-z0-9_-]{1,128}\/printers\/[A-Za-z0-9_-]{1,128}\/(?:jobs|ordinaryDispatches|manualPrintRequests)\/[A-Za-z0-9_-]{1,128}$/) }).strict();
export type PrintLogCursor = z.infer<typeof cursorSchema>;
export function decodePrintLogCursor(value: string | undefined, brandId: string): PrintLogCursor | null {
  if (!value) return null;
  try {
    if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (cursor.brandId !== brandId) throw new Error();
    return cursor;
  } catch { throw new PrintLogError('print_log_invalid', 400); }
}
export function encodePrintLogCursor(cursor: PrintLogCursor) { return Buffer.from(JSON.stringify(cursor)).toString('base64url'); }
