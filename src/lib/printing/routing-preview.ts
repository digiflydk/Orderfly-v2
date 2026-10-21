import { z } from 'zod';
import { printerConfigurationSchema } from './configuration';

/** Pure normalized-input preview, never an authorization, persisted rule or print intent. */
export const PRINT_ROUTING_LIMITS = Object.freeze({ printers: 16, rules: 256, lines: 50, modifiersPerLine: 8, deliveryTypesPerRule: 2, inputCodeUnits: 32768 });
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const text = (max: number) => z.string().min(1).max(max)
  .refine(value => !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value))
  .refine(value => value.trim().length > 0);
const scopeSchema = z.object({ brandId: id, locationId: id }).strict();
const commonLine = { lineId: id, brandId: id, locationId: id, name: text(160), quantity: z.number().int().min(1).max(99),
  modifiers: z.array(text(160)).max(PRINT_ROUTING_LIMITS.modifiersPerLine).optional(), kitchenNote: text(400).optional() };
const productLine = z.object({ ...commonLine, itemType: z.literal('product'), productId: id, categoryId: id }).strict();
const comboLine = z.object({ ...commonLine, itemType: z.literal('combo') }).strict();
const selector = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }).strict(),
  z.object({ type: z.literal('category'), id }).strict(),
  z.object({ type: z.literal('product'), id }).strict(),
]);
const ruleSchema = z.object({
  id, brandId: id, locationId: id, printerId: id,
  match: selector, effect: z.enum(['include', 'exclude']),
  deliveryTypes: z.array(z.enum(['Pickup', 'Delivery'])).min(1).max(PRINT_ROUTING_LIMITS.deliveryTypesPerRule).optional(),
}).strict();
const inputSchema = z.object({
  scope: scopeSchema, deliveryType: z.enum(['Pickup', 'Delivery']),
  printers: z.array(z.object({ configuration: printerConfigurationSchema, deleted: z.boolean() }).strict()).max(PRINT_ROUTING_LIMITS.printers),
  rules: z.array(ruleSchema).max(PRINT_ROUTING_LIMITS.rules),
  lines: z.array(z.discriminatedUnion('itemType', [productLine, comboLine])).min(1).max(PRINT_ROUTING_LIMITS.lines),
}).strict();
export type PrinterRoutingPreviewInput = z.input<typeof inputSchema>;
export type PrinterRoutingRule = z.input<typeof ruleSchema>;
export type PrinterRoutingLine = z.output<typeof productLine>;
type Decision = {
  lineId: string; printerId: string;
  outcome: 'included' | 'excluded' | 'no_matching_rule' | 'printer_disabled' | 'combo_requires_projection';
  selectedRuleIds: string[]; shadowedRuleIds: string[];
};
export class PrinterRoutingError extends Error {
  constructor(readonly code: 'invalid_input' | 'scope_mismatch' | 'invalid_reference' | 'duplicate_identity' | 'input_too_large') { super(code); }
}
function unique(values: string[]) { return new Set(values).size === values.length; }
const priority = { all: 0, category: 1, product: 2 } as const;

/**
 * Caller supplies already scoped, server-projected product/category snapshots. There
 * is intentionally no arbitrary OrderDetail/CartItem adapter, lookup or I/O here.
 */
export function previewPrinterRouting(input: unknown) {
  // Reject gross collection overflow before Zod traverses every element.
  const raw = input as Partial<Record<'printers' | 'rules' | 'lines', unknown>> | null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PrinterRoutingError('invalid_input');
  for (const key of ['printers', 'rules', 'lines'] as const) {
    if (!Array.isArray(raw[key]) || raw[key].length > PRINT_ROUTING_LIMITS[key]) throw new PrinterRoutingError('invalid_input');
  }
  // Zod's array max reports an error but still parses every element. These
  // outer collections are bounded above; inspect nested lengths without
  // touching their elements before allowing any schema traversal.
  for (const [collection, field, maximum] of [
    [raw.lines, 'modifiers', PRINT_ROUTING_LIMITS.modifiersPerLine],
    [raw.rules, 'deliveryTypes', PRINT_ROUTING_LIMITS.deliveryTypesPerRule],
  ] as const) {
    for (const entry of collection as unknown[]) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const nested = (entry as Record<string, unknown>)[field];
      if (Array.isArray(nested) && nested.length > maximum) throw new PrinterRoutingError('invalid_input');
    }
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new PrinterRoutingError('invalid_input');
  const data = parsed.data;
  if (JSON.stringify(data).length > PRINT_ROUTING_LIMITS.inputCodeUnits) throw new PrinterRoutingError('input_too_large');
  if (!unique(data.printers.map(p => p.configuration.id)) || !unique(data.rules.map(r => r.id)) || !unique(data.lines.map(l => l.lineId))
    || data.rules.some(r => r.deliveryTypes && !unique(r.deliveryTypes))) throw new PrinterRoutingError('duplicate_identity');
  if (data.printers.some(p => p.configuration.brandId !== data.scope.brandId || p.configuration.locationId !== data.scope.locationId)
    || data.rules.some(r => r.brandId !== data.scope.brandId || r.locationId !== data.scope.locationId)
    || data.lines.some(l => l.brandId !== data.scope.brandId || l.locationId !== data.scope.locationId)) throw new PrinterRoutingError('scope_mismatch');
  const printerIds = new Set(data.printers.map(p => p.configuration.id));
  if (data.printers.some(p => p.deleted) || data.rules.some(r => !printerIds.has(r.printerId))) throw new PrinterRoutingError('invalid_reference');
  const printers = [...data.printers].sort((a, b) => a.configuration.id < b.configuration.id ? -1 : a.configuration.id > b.configuration.id ? 1 : 0);
  const decisions: Decision[] = [];
  const targets: Array<{ printerId: string; state: 'active' | 'paused'; dispatchAuthorized: false; lines: PrinterRoutingLine[] }> = [];
  for (const { configuration: printer } of printers) {
    const lines: PrinterRoutingLine[] = [];
    for (const line of data.lines) {
      const base = { lineId: line.lineId, printerId: printer.id, selectedRuleIds: [] as string[], shadowedRuleIds: [] as string[] };
      if (line.itemType === 'combo') { decisions.push({ ...base, outcome: 'combo_requires_projection' }); continue; }
      const matching = data.rules.filter(rule => rule.printerId === printer.id
        && (!rule.deliveryTypes || rule.deliveryTypes.includes(data.deliveryType))
        && (rule.match.type === 'all' || (rule.match.type === 'product' ? rule.match.id === line.productId : rule.match.id === line.categoryId)));
      const highest = Math.max(-1, ...matching.map(rule => priority[rule.match.type]));
      const selected = matching.filter(rule => priority[rule.match.type] === highest);
      const decision = { ...base, selectedRuleIds: selected.map(rule => rule.id).sort(),
        shadowedRuleIds: matching.filter(rule => priority[rule.match.type] < highest).map(rule => rule.id).sort() };
      if (!selected.length) decisions.push({ ...decision, outcome: 'no_matching_rule' });
      else if (selected.some(rule => rule.effect === 'exclude')) decisions.push({ ...decision, outcome: 'excluded' });
      else if (printer.state === 'disabled') decisions.push({ ...decision, outcome: 'printer_disabled' });
      else { lines.push(structuredClone(line)); decisions.push({ ...decision, outcome: 'included' }); }
    }
    if (lines.length && printer.state !== 'disabled') targets.push({ printerId: printer.id, state: printer.state, dispatchAuthorized: false, lines });
  }
  const included = new Set(targets.flatMap(target => target.lines.map(line => line.lineId)));
  return {
    mode: 'preview' as const, dispatchAuthorized: false as const, targets, decisions,
    unrouted: data.lines.filter(line => !included.has(line.lineId)).map(line => ({ lineId: line.lineId,
      reason: line.itemType === 'combo' ? 'combo_requires_projection' as const : 'no_included_printer' as const })),
  };
}
