import { z } from 'zod';
export const automaticPrintSkipReasonSchema = z.enum(['disabled', 'brand_inactive', 'outside_activation', 'no_available_target', 'not_configured', 'output_disabled', 'test_window_unavailable', 'invalid_reference', 'invalid_catalog', 'invalid_order', 'combo_requires_projection', 'projection_too_large']);
export type AutomaticPrintSkipReason = z.infer<typeof automaticPrintSkipReasonSchema>;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const automaticPrintSkipSchema = z.object({ schemaVersion: z.literal(1), brandId: id, locationId: id, orderId: id, reason: automaticPrintSkipReasonSchema, createdAt: z.number().int().nonnegative().safe().max(8.64e15) }).strict();
export const automaticPrintSkipLabels: Record<AutomaticPrintSkipReason, string> = {
  disabled: 'Automatisk print er slået fra for brandet.', brand_inactive: 'Brandet er ikke aktivt.',
  outside_activation: 'Ordren ligger uden for den aktuelle aktivering af automatisk print.',
  no_available_target: 'Ingen gyldig printerrute med en aktiv printer og printeradgang er tilgængelig.',
  not_configured: 'Automatisk print er ikke opsat.', output_disabled: 'Automatisk print er slået fra i driftsopsætningen.',
  test_window_unavailable: 'Det tidligere testvindue er udløbet eller ikke længere gyldigt.',
  invalid_reference: 'En varereference på ordren kan ikke bruges til print.',
  invalid_catalog: 'Varerne kan ikke valideres mod lokationens katalog.',
  invalid_order: 'Ordrens varedata kan ikke bruges til print.',
  combo_requires_projection: 'Menuens gemte valg kan ikke omsættes til en komplet køkkenbon.',
  projection_too_large: 'Ordren overskrider grænsen for automatisk print.',
};
