import { z } from 'zod';

/** Pure preview only. This is deliberately not a printer encoding or an order projection. */
export const KITCHEN_RECEIPT_LIMITS = Object.freeze({
  items: 50, modifiersPerItem: 8, inputCodeUnits: 8192, outputUtf8Bytes: 32768, outputLines: 512,
});
export const KITCHEN_PREVIEW_COLUMNS = Object.freeze({ 58: 32, 80: 48 });

// No caller-supplied line breaks, control/escape sequences, bidi/format controls or lone surrogates.
// Literal markup stays plain text: this renderer never parses tags or printer commands.
const forbidden = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u;
const field = (max: number) => z.string().min(1).max(max)
  .refine(value => !forbidden.test(value), 'invalid_text')
  .transform(value => value.normalize('NFC').replace(/\p{Zs}+/gu, ' ').trim())
  .refine(value => value.length > 0, 'empty_text');
const itemSchema = z.object({
  quantity: z.number().int().min(1).max(99),
  name: field(160),
  modifiers: z.array(field(160)).max(KITCHEN_RECEIPT_LIMITS.modifiersPerItem).optional(),
  literalModifiers: z.array(field(160)).max(KITCHEN_RECEIPT_LIMITS.modifiersPerItem).optional(),
  kitchenNote: field(400).optional(),
}).strict();
const snapshotSchema = z.object({
  // Display reference, not a database ID, payment reference or job/receipt token.
  orderReference: field(32),
  fulfillmentLabel: field(64),
  fulfillmentTime: field(64),
  items: z.array(itemSchema).min(1).max(KITCHEN_RECEIPT_LIMITS.items),
  kitchenNote: field(400).optional(),
}).strict();
const profileSchema = z.object({
  paperWidthMm: z.union([z.literal(58), z.literal(80)]),
  columns: z.number().int().min(16).max(80).optional(),
}).strict();
export type KitchenReceiptSnapshot = z.input<typeof snapshotSchema>;
export type KitchenReceiptPreviewProfile = z.input<typeof profileSchema>;

export class KitchenReceiptError extends Error {
  constructor(readonly code: 'invalid_snapshot' | 'invalid_profile' | 'receipt_too_large') {
    // Fixed codes only: errors must not echo possibly private rejected input.
    super(code);
  }
}

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
function graphemes(value: string) {
  return Array.from(segmenter.segment(value), part => part.segment);
}

/** Width means preview grapheme count, not device glyph/dot/byte width. */
function wrap(value: string, firstPrefix: string, continuationPrefix: string, columns: number): string[] {
  const remaining = graphemes(value);
  const lines: string[] = [];
  while (remaining.length) {
    const prefix = lines.length ? continuationPrefix : firstPrefix;
    const available = columns - prefix.length; // Prefixes are fixed ASCII.
    let take = Math.min(available, remaining.length);
    if (take < remaining.length) {
      // Prefer a word boundary; hard wrap a word when it cannot fit on one line.
      const space = remaining.lastIndexOf(' ', take);
      if (space > 0) take = space;
    }
    lines.push(prefix + remaining.splice(0, take).join(''));
    while (remaining[0] === ' ') remaining.shift();
  }
  return lines;
}

/**
 * Accept an explicit allowlisted snapshot only. There is no arbitrary order object, I/O,
 * timestamp formatting, transport content type, encoded print payload or hardware command.
 */
export function renderKitchenReceipt(snapshot: unknown, profile: unknown = { paperWidthMm: 58 }) {
  const parsedProfile = profileSchema.safeParse(profile);
  if (!parsedProfile.success) throw new KitchenReceiptError('invalid_profile');
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) throw new KitchenReceiptError('invalid_snapshot');
  const data = parsed.data;
  const textFields = [data.orderReference, data.fulfillmentLabel, data.fulfillmentTime, data.kitchenNote ?? '',
    ...data.items.flatMap(item => [item.name, item.kitchenNote ?? '', ...(item.modifiers ?? []), ...(item.literalModifiers ?? [])])];
  if (textFields.reduce((size, value) => size + value.length, 0) > KITCHEN_RECEIPT_LIMITS.inputCodeUnits) {
    throw new KitchenReceiptError('receipt_too_large');
  }
  const { paperWidthMm } = parsedProfile.data;
  const columns = parsedProfile.data.columns ?? KITCHEN_PREVIEW_COLUMNS[paperWidthMm];
  const lines = [
    'KITCHEN',
    ...wrap(data.orderReference, 'Order: ', '       ', columns),
    ...wrap(data.fulfillmentLabel, 'Type: ', '      ', columns),
    ...wrap(data.fulfillmentTime, 'Time: ', '      ', columns),
    '-'.repeat(columns),
  ];
  for (const item of data.items) {
    const prefix = `${item.quantity} x `;
    lines.push(...wrap(item.name, prefix, ' '.repeat(prefix.length), columns));
    for (const modifier of item.modifiers ?? []) lines.push(...wrap(modifier, '  + ', '    ', columns));
    // Saved order selections include removals ("Uden løg"). Preserve their
    // meaning rather than prefixing every selection with an addition sign.
    for (const modifier of item.literalModifiers ?? []) lines.push(...wrap(modifier, '    ', '    ', columns));
    if (item.kitchenNote) lines.push(...wrap(item.kitchenNote, '  Note: ', '        ', columns));
  }
  if (data.kitchenNote) lines.push('-'.repeat(columns), ...wrap(data.kitchenNote, 'Note: ', '      ', columns));
  const text = lines.join('\n') + '\n';
  const utf8Bytes = new TextEncoder().encode(text).length;
  if (utf8Bytes > KITCHEN_RECEIPT_LIMITS.outputUtf8Bytes || lines.length > KITCHEN_RECEIPT_LIMITS.outputLines) {
    throw new KitchenReceiptError('receipt_too_large');
  }
  return {
    text, utf8Bytes,
    preview: { paperWidthMm, columns, columnUnit: 'grapheme' as const, physicalFitVerified: false as const },
  };
}
