import { z } from 'zod';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const revision = z.number().int().nonnegative().safe();
const instant = z.number().int().positive().safe().max(8.64e15);
export const automaticActivationIdSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const automaticPrintScopeSchema = z.object({ brandId: id }).strict();
export const automaticPrintCommandSchema = automaticPrintScopeSchema.extend({ enabled: z.boolean(), expectedRevision: revision }).strict();
export const storedBrandAutomaticPrintSchema = automaticPrintScopeSchema.extend({ schemaVersion: z.literal(1),
  enabled: z.boolean(), revision: revision.positive(), enabledAt: instant.nullable(), activationId: automaticActivationIdSchema.nullable(), updatedAt: instant,
}).strict().refine(row => row.enabled === (row.enabledAt !== null && row.activationId !== null)
  && (row.enabled || row.enabledAt === null && row.activationId === null) && (row.enabledAt === null || row.enabledAt <= row.updatedAt));
export type BrandAutomaticPrint = z.infer<typeof storedBrandAutomaticPrintSchema>;
export class AutomaticPrintError extends Error {
  constructor(readonly code: 'automatic_print_invalid' | 'automatic_print_conflict' | 'automatic_print_unavailable', readonly status: number = 503) { super(code); }
}
export function projectBrandAutomaticPrint(brandId: string, record: BrandAutomaticPrint | null) {
  return { brandId, enabled: record?.enabled ?? false, revision: record?.revision ?? 0, enabledAt: record?.enabledAt ?? null };
}
