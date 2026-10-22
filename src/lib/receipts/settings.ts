import { z } from 'zod';

// Plain presentation text only. Printer escape sequences and other control
// characters are never accepted; newline is useful for address/footer text.
const text = (max: number) => z.string().max(max).refine(value => !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value), 'Unsupported control character');
export const receiptSettingsSchema = z.object({
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
  heading: text(80), footer: text(240), address: text(160), phone: text(40), website: text(120),
  showBrandName: z.boolean(), showLocationName: z.boolean(), showCustomer: z.boolean(),
  showContact: z.boolean(), showModifiers: z.boolean(), showNotes: z.boolean(),
}).strict();
export type ReceiptSettings = z.infer<typeof receiptSettingsSchema>;
export const DEFAULT_RECEIPT_SETTINGS: Readonly<ReceiptSettings> = Object.freeze({
  paperWidthMm: 80, heading: 'Kvittering', footer: 'Tak for din bestilling', address: '', phone: '', website: '',
  showBrandName: true, showLocationName: true, showCustomer: false, showContact: false, showModifiers: true, showNotes: true,
});
export type ReceiptSettingsRecord = { brandId: string; revision: number; settings: ReceiptSettings };
