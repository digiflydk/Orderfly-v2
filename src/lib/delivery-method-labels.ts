import { z } from 'zod';

export const DELIVERY_METHOD_LABEL_MAX_LENGTH = 40;
export const deliveryMethodLabelSchema = z.string().trim()
  .max(DELIVERY_METHOD_LABEL_MAX_LENGTH, 'Label må højst være 40 tegn.')
  .refine(value => !/[<>\u0000-\u001f\u007f]/.test(value), 'Brug almindelig tekst på én linje.')
  .optional();

type LabelLocation = { pickupLabel?: unknown; deliveryLabel?: unknown; pickupSaveTag?: unknown };

/** Labels describe an offer; pricing is always calculated independently. */
export function deliveryMethodLabel(location: LabelLocation | null | undefined, mode: 'pickup' | 'delivery'): string {
  const raw = mode === 'pickup' ? location?.pickupLabel : location?.deliveryLabel;
  // An explicitly empty label hides the legacy pickup tag too.
  if (raw !== undefined && raw !== null) {
    const parsed = deliveryMethodLabelSchema.safeParse(raw);
    return parsed.success ? parsed.data ?? '' : '';
  }
  if (mode !== 'pickup' || typeof location?.pickupSaveTag !== 'string') return '';
  const legacy = location.pickupSaveTag.trim();
  if (!legacy) return '';
  const label = /^(spar|save)\s/i.test(legacy) ? legacy.replace(/^save\s/i, 'Spar ') : `Spar ${legacy}`;
  const parsed = deliveryMethodLabelSchema.safeParse(label);
  return parsed.success ? parsed.data ?? '' : '';
}
