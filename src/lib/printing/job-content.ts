import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { encodeKitchenPng, KITCHEN_PNG_LIMITS } from './kitchen-png';

const identifier = z.string().max(128).regex(/^[A-Za-z0-9_-]{1,128}$/);
const bindingSchema = z.object({
  brandId: identifier, locationId: identifier, printerId: identifier,
  printerRevision: z.number().int().positive().safe(),
  model: z.enum(['mc-print2', 'mc-print3']), paperWidthMm: z.union([z.literal(58), z.literal(80)]),
}).strict().refine(value => value.model !== 'mc-print2' || value.paperWidthMm === 58);
const maxBase64 = 4 * Math.ceil(KITCHEN_PNG_LIMITS.payloadBytes / 3);
const envelopeSchema = z.object({
  schemaVersion: z.literal(1), purpose: z.literal('synthetic-testbon'),
  contentVersion: z.literal('orderfly-testbon-v1'), encoderVersion: z.literal('orderfly-kitchen-png-v1'),
  binding: bindingSchema, contentType: z.literal('image/png'),
  raster: z.object({ widthDots: z.union([z.literal(384), z.literal(576)]),
    heightDots: z.number().int().positive().max(KITCHEN_PNG_LIMITS.heightDots),
    font: z.literal('orderfly-kitchen-bitmap-v1'), physicalFitVerified: z.literal(false) }).strict(),
  byteLength: z.number().int().positive().max(KITCHEN_PNG_LIMITS.payloadBytes),
  sha256: z.string().length(64).regex(/^[a-f0-9]{64}$/),
  payloadBase64: z.string().min(4).max(maxBase64),
}).strict();
export type SyntheticTestBonBinding = z.input<typeof bindingSchema>;
export type SyntheticTestBonContent = Readonly<Omit<z.output<typeof envelopeSchema>, 'binding' | 'raster'>> & {
  readonly binding: Readonly<z.output<typeof bindingSchema>>;
  readonly raster: Readonly<z.output<typeof envelopeSchema>['raster']>;
};
export class PrintJobContentError extends Error {
  constructor(readonly code: 'invalid_binding' | 'invalid_content') { super(code); }
}
const fail = (code: PrintJobContentError['code']): never => { throw new PrintJobContentError(code); };

// Reject hostile accessors, exotic objects and oversized fields before schema work.
// Envelopes intentionally contain no arrays or arbitrary receipt/customer fields.
function snapshot(input: unknown, content: boolean): unknown {
  let nodes = 0, units = 0;
  function copy(value: unknown, depth: number, key = ''): unknown {
    if (++nodes > 40 || depth > 2) return fail(content ? 'invalid_content' : 'invalid_binding');
    if (typeof value === 'string') {
      units += value.length;
      if (value.length > (content && depth === 1 && key === 'payloadBase64' ? maxBase64 : 128)
        || units > maxBase64 + 2048) return fail(content ? 'invalid_content' : 'invalid_binding');
      return value;
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      return fail(content ? 'invalid_content' : 'invalid_binding');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length > 11) return fail(content ? 'invalid_content' : 'invalid_binding');
    const result: Record<string, unknown> = Object.create(null);
    for (const field of keys) {
      if (typeof field !== 'string' || field.length > 64) return fail(content ? 'invalid_content' : 'invalid_binding');
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !('value' in descriptor)) return fail(content ? 'invalid_content' : 'invalid_binding');
      result[field] = copy(descriptor.value, depth + 1, field);
    }
    return result;
  }
  return copy(input, 0);
}
function binding(input: unknown): z.output<typeof bindingSchema> {
  const parsed = bindingSchema.safeParse(snapshot(input, false));
  return parsed.success ? parsed.data : fail('invalid_binding');
}

/** Fixed synthetic text only. A caller cannot supply orders, customer data or commands. */
export function createSyntheticTestBonContent(input: unknown): SyntheticTestBonContent {
  const target = binding(input);
  const encoded = encodeKitchenPng({
    orderReference: 'ORDERFLY TEST', fulfillmentLabel: 'TESTBON - IKKE EN ORDRE',
    fulfillmentTime: 'Syntetisk test',
    items: [{ quantity: 1, name: 'Dansk test: ÆØÅ æøå', modifiers: ['58/80 mm papir'], kitchenNote: 'Ingen madproduktion' }],
    kitchenNote: 'Kontroller udskrift manuelt',
  }, { model: target.model, paperWidthMm: target.paperWidthMm });
  const envelope = {
    schemaVersion: 1 as const, purpose: 'synthetic-testbon' as const,
    contentVersion: 'orderfly-testbon-v1' as const, encoderVersion: 'orderfly-kitchen-png-v1' as const,
    binding: Object.freeze(target), contentType: encoded.contentType,
    raster: Object.freeze({ widthDots: encoded.raster.widthDots as 384 | 576, heightDots: encoded.raster.heightDots,
      font: encoded.raster.font, physicalFitVerified: false as const }),
    byteLength: encoded.payload.length, sha256: createHash('sha256').update(encoded.payload).digest('hex'),
    payloadBase64: encoded.payload.toString('base64'),
  };
  return Object.freeze(envelope);
}

/** Content consistency only, never authenticated native scope, device or output authority.
 * The future caller must obtain expectedBinding from authorized native state itself.
 * Every return owns its Buffer; mutating it cannot change subsequent reads.
 */
export function readSyntheticTestBonContent(input: unknown, expectedBinding: unknown) {
  const target = binding(expectedBinding);
  const parsed = envelopeSchema.safeParse(snapshot(input, true));
  if (!parsed.success) return fail('invalid_content');
  const content = parsed.data;
  if (JSON.stringify(content.binding) !== JSON.stringify(target)) return fail('invalid_content');
  const bytes = Buffer.from(content.payloadBase64, 'base64');
  if (bytes.toString('base64') !== content.payloadBase64 || bytes.length !== content.byteLength
    || createHash('sha256').update(bytes).digest('hex') !== content.sha256) return fail('invalid_content');
  // A recomputed caller digest is not proof of origin. Require this version's exact
  // synthetic bytes/profile too, excluding arbitrary PNG/private text substitution.
  const canonical = createSyntheticTestBonContent(target);
  if (content.sha256 !== canonical.sha256 || content.payloadBase64 !== canonical.payloadBase64
    || JSON.stringify(content.raster) !== JSON.stringify(canonical.raster)) return fail('invalid_content');
  return Object.freeze({ contentType: content.contentType, payload: bytes, binding: Object.freeze(target),
    sha256: content.sha256, contentVersion: content.contentVersion, raster: Object.freeze(content.raster),
    dispatchAuthorized: false as const });
}
