import 'server-only';
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const instant = z.number().int().nonnegative().safe().max(8.64e15);
const revision = z.number().int().positive().safe();
// Server instances can disagree briefly despite sharing the same authoritative clock source.
// This only affects reading already stored server timestamps; clients never supply these values.
const SERVER_CLOCK_SKEW_TOLERANCE_MS = 30_000;
export const printerActivitySchema = z.object({
  schemaVersion: z.literal(1), brandId: id, locationId: id, printerId: id,
  // Server-generated time of the latest audited software lifecycle resume.
  activatedAt: instant.nullable(), activationRevision: revision.nullable(),
  printHistory: z.enum(['unknown', 'never', 'confirmed']),
  lastConfirmedPrintAt: instant.nullable(),
  lastConfirmedJobId: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict().refine(row => (row.activatedAt === null) === (row.activationRevision === null))
  .refine(row => row.printHistory === 'confirmed'
    ? row.lastConfirmedPrintAt !== null && row.lastConfirmedJobId !== null
    : row.lastConfirmedPrintAt === null && row.lastConfirmedJobId === null);

export class PrinterActivityError extends Error {
  constructor() { super('printer_activity_unavailable'); }
}

type Scope = { brandId: string; locationId: string; printerId: string };
export function initialPrinterActivity(scope: Scope, fresh: boolean) {
  return { schemaVersion: 1 as const, brandId: scope.brandId, locationId: scope.locationId,
    printerId: scope.printerId, activatedAt: null, activationRevision: null,
    printHistory: fresh ? 'never' as const : 'unknown' as const,
    lastConfirmedPrintAt: null, lastConfirmedJobId: null };
}

/** No client input, historical scans, private fields or physical-output authority. */
export function readStoredPrinterActivity(value: unknown, scope: Scope, printerRevision: number, now = Date.now()) {
  if (value === undefined) return initialPrinterActivity(scope, false);
  const parsed = printerActivitySchema.safeParse(value);
  if (!parsed.success || parsed.data.brandId !== scope.brandId || parsed.data.locationId !== scope.locationId
    || parsed.data.printerId !== scope.printerId || (parsed.data.activationRevision ?? 0) > printerRevision
    || (parsed.data.activatedAt ?? 0) - now > SERVER_CLOCK_SKEW_TOLERANCE_MS
    || (parsed.data.lastConfirmedPrintAt ?? 0) - now > SERVER_CLOCK_SKEW_TOLERANCE_MS) {
    throw new PrinterActivityError();
  }
  return parsed.data;
}

export function projectPrinterActivity(value: unknown, scope: Scope, printerRevision: number) {
  const row = readStoredPrinterActivity(value, scope, printerRevision);
  return { activatedAt: row.activatedAt, lastConfirmedPrintAt: row.lastConfirmedPrintAt, printHistory: row.printHistory };
}
