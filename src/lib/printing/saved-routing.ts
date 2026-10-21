import 'server-only';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { isSyntheticProduct } from '@/lib/synthetic-product';
import { storedPrinterSchema } from './storage';
import { PRINT_ROUTING_LIMITS, printerRoutingRuleSchema, previewPrinterRouting, type PrinterRoutingRule, type PrinterRoutingLine } from './routing-preview';
import type { PrinterConfiguration } from './domain';

const id = z.string().max(128).regex(/^[A-Za-z0-9_-]{1,128}$/);
const scopeSchema = z.object({ brandId: id, locationId: id }).strict();
const rulesSchema = z.array(printerRoutingRuleSchema).max(PRINT_ROUTING_LIMITS.rules);
const commandSchema = scopeSchema.extend({ expectedRevision: z.number().int().nonnegative().safe(), rules: rulesSchema }).strict();
const storedSchema = scopeSchema.extend({ schemaVersion: z.literal(1), id: z.literal('original'),
  revision: z.number().int().positive().safe(), rules: rulesSchema, deletedAt: z.null(),
  createdAt: z.unknown().optional(), updatedAt: z.unknown().optional() }).strict();
type Scope = z.infer<typeof scopeSchema>;
export class SavedPrinterRoutingError extends Error {
  constructor(readonly code: 'invalid_request' | 'routing_unverified' | 'reference_unverified' | 'record_conflict' | 'writes_unavailable' | 'routing_unavailable', readonly status: number) { super(code); }
}
const fail = (code: SavedPrinterRoutingError['code'], status = 400): never => { throw new SavedPrinterRoutingError(code, status); };
type Row = Record<string, unknown>;
function field(row: Row, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(row, key);
  if (descriptor && !('value' in descriptor)) return fail('reference_unverified', 409);
  return descriptor?.value;
}
// Snapshot bounded JSON-like selected data before schema regex/traversal.
function bounded(value: unknown): unknown {
  let nodes = 0, units = 0;
  function copy(input: unknown, depth: number): unknown {
    if (++nodes > 8192 || depth > 6) return fail('invalid_request');
    if (typeof input === 'string') {
      units += input.length;
      if (input.length > 400 || units > PRINT_ROUTING_LIMITS.inputCodeUnits) return fail('invalid_request');
      return input;
    }
    if (input === null || typeof input === 'boolean' || typeof input === 'number') return input;
    if (!input || typeof input !== 'object') return fail('invalid_request');
    if (Array.isArray(input)) {
      if (input.length > PRINT_ROUTING_LIMITS.rules) return fail('invalid_request');
      const result = [];
      for (let index = 0; index < input.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor || !('value' in descriptor)) return fail('invalid_request');
        result.push(copy(descriptor.value, depth + 1));
      }
      return result;
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail('invalid_request');
    const keys = Reflect.ownKeys(input);
    if (keys.length > 16) return fail('invalid_request');
    const result: Row = Object.create(null);
    for (const key of keys) {
      if (typeof key !== 'string' || key.length > 128) return fail('invalid_request');
      result[key] = copy(field(input as Row, key), depth + 1);
    }
    return result;
  }
  const result = copy(value, 0);
  if (JSON.stringify(result).length > PRINT_ROUTING_LIMITS.inputCodeUnits) return fail('invalid_request');
  return result;
}
async function native(context: NativeTransactionContext, collection: string, key: string): Promise<Row> {
  const snapshot = await context.transaction.get(context.db.collection(collection).doc(key));
  const value = snapshot.data();
  if (!snapshot.exists || snapshot.id !== key || !value || typeof value !== 'object' || Array.isArray(value)) return fail('reference_unverified', 409);
  const row = value as Row;
  if (field(row, 'id') !== undefined && field(row, 'id') !== key) return fail('reference_unverified', 409);
  for (const marker of ['deleted', 'isDeleted', 'isTestData']) if (field(row, marker) !== undefined && field(row, marker) !== false) return fail('reference_unverified', 409);
  if (field(row, 'deletedAt') !== undefined && field(row, 'deletedAt') !== null) return fail('reference_unverified', 409);
  return row;
}
async function nativeScope(context: NativeTransactionContext, scope: Scope) {
  const [brand, location] = await Promise.all([native(context, 'brands', scope.brandId), native(context, 'locations', scope.locationId)]);
  if (field(location, 'brandId') !== scope.brandId) return fail('reference_unverified', 409);
  for (const row of [brand, location]) if (field(row, 'isActive') !== undefined && field(row, 'isActive') !== true) return fail('reference_unverified', 409);
}
function membership(row: Row, locationId: string, allowGlobal: boolean) {
  const value = field(row, 'locationIds');
  const raw = value === undefined && allowGlobal ? [] : value;
  if (!Array.isArray(raw) || raw.length > 100) return fail('reference_unverified', 409);
  const ids: string[] = [];
  for (let index = 0; index < raw.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
    const parsed = descriptor && 'value' in descriptor && typeof descriptor.value === 'string' && descriptor.value.length <= 128 ? id.safeParse(descriptor.value) : null;
    if (!parsed?.success) return fail('reference_unverified', 409);
    ids.push(parsed.data);
  }
  if (new Set(ids).size !== ids.length || (!ids.length && !allowGlobal) || ids.length && !ids.includes(locationId)) return fail('reference_unverified', 409);
}
function ruleIdentities(scope: Scope, rules: PrinterRoutingRule[]) {
  if (new Set(rules.map(rule => rule.id)).size !== rules.length || rules.some(rule => rule.brandId !== scope.brandId || rule.locationId !== scope.locationId
    || rule.deliveryTypes && new Set(rule.deliveryTypes).size !== rule.deliveryTypes.length)) return fail('invalid_request');
  const printerIds = [...new Set(rules.map(rule => rule.printerId))];
  if (printerIds.length > PRINT_ROUTING_LIMITS.printers) return fail('invalid_request');
  return printerIds;
}
async function references(context: NativeTransactionContext, scope: Scope, rules: PrinterRoutingRule[]) {
  const printerIds = ruleIdentities(scope, rules);
  const printers: Array<Readonly<{ configuration: Readonly<PrinterConfiguration>; revision: number }>> = [];
  for (const printerId of printerIds.sort()) {
    const snapshot = await context.transaction.get(context.db.collection('locations').doc(scope.locationId).collection('printers').doc(printerId));
    const row = snapshot.data();
    if (!snapshot.exists || snapshot.id !== printerId || !row || typeof row !== 'object' || Array.isArray(row)) return fail('reference_unverified', 409);
    const fields = ['schemaVersion', 'configuration', 'revision', 'deletedAt', 'createdAt', 'updatedAt'];
    const keys = Reflect.ownKeys(row);
    if (keys.length > fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return fail('reference_unverified', 409);
    const selected = Object.fromEntries(keys.map(key => [key, key === 'configuration' ? bounded(field(row, key as string)) : field(row, key as string)]));
    const record = storedPrinterSchema.safeParse(selected);
    if (!record.success || record.data.configuration.id !== printerId || record.data.configuration.brandId !== scope.brandId
      || record.data.configuration.locationId !== scope.locationId) return fail('reference_unverified', 409);
    // Disabled printers are legitimate draft references, never intent activation.
    printers.push(Object.freeze({ configuration: Object.freeze(record.data.configuration), revision: record.data.revision }));
  }
  const categoryIds = new Set(rules.filter(rule => rule.match.type === 'category').map(rule => 'id' in rule.match ? rule.match.id : ''));
  for (const productId of new Set(rules.filter(rule => rule.match.type === 'product').map(rule => 'id' in rule.match ? rule.match.id : ''))) {
    const product = await native(context, 'products', productId);
    if (field(product, 'brandId') !== scope.brandId || field(product, 'isActive') !== true) return fail('reference_unverified', 409);
    membership(product, scope.locationId, true);
    const name = field(product, 'productName'), description = field(product, 'description');
    if (typeof name !== 'string' || !name.length || name.length > 160 || description !== undefined && (typeof description !== 'string' || description.length > 4096)
      || isSyntheticProduct({ productName: name, description: description as string | undefined })) return fail('reference_unverified', 409);
    const category = field(product, 'categoryId');
    if (typeof category !== 'string' || category.length > 128 || !id.safeParse(category).success) return fail('reference_unverified', 409);
    categoryIds.add(category);
  }
  for (const categoryId of categoryIds) {
    const category = await native(context, 'categories', categoryId);
    if (field(category, 'isActive') !== true) return fail('reference_unverified', 409);
    // Actual category ownership is native location membership, not legacy brandId.
    membership(category, scope.locationId, false);
  }
  return Object.freeze(printers);
}
function readStored(snapshot: FirebaseFirestore.DocumentSnapshot, scope: Scope) {
  if (!snapshot.exists) return null;
  const row = snapshot.data();
  if (!row || typeof row !== 'object' || Array.isArray(row)) return fail('routing_unverified', 409);
  let parsed;
  try {
    const keys = Reflect.ownKeys(row);
    const fields = ['schemaVersion', 'id', 'brandId', 'locationId', 'revision', 'rules', 'deletedAt', 'createdAt', 'updatedAt'];
    if (keys.length > fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return fail('routing_unverified', 409);
    const selected = Object.fromEntries(fields.slice(0, 7).map(key => [key, field(row, key)]));
    parsed = storedSchema.safeParse({ ...(bounded(selected) as Row),
      ...(Object.hasOwn(row, 'createdAt') ? { createdAt: field(row, 'createdAt') } : {}),
      ...(Object.hasOwn(row, 'updatedAt') ? { updatedAt: field(row, 'updatedAt') } : {}) });
  } catch { return fail('routing_unverified', 409); }
  if (!parsed.success || snapshot.id !== 'original' || parsed.data.brandId !== scope.brandId || parsed.data.locationId !== scope.locationId) return fail('routing_unverified', 409);
  try { ruleIdentities(scope, parsed.data.rules); } catch { return fail('routing_unverified', 409); }
  return parsed.data;
}
const savedRef = (context: NativeTransactionContext, scope: Scope) => context.db.collection('locations').doc(scope.locationId).collection('printerRouting').doc('original');
function immutableRules(rules: PrinterRoutingRule[]) {
  return Object.freeze(rules.map(rule => Object.freeze({ ...rule, match: Object.freeze({ ...rule.match }),
    ...(rule.deliveryTypes ? { deliveryTypes: Object.freeze([...rule.deliveryTypes]) } : {}) })));
}
/** Native preparation only. Re-run in every caller-owned transaction attempt.
 * Caller must authenticate its event/actor; this is not write/payment/commit authority.
 */
export async function prepareSavedPrinterRouting(context: NativeTransactionContext, input: unknown) {
  const parsed = scopeSchema.safeParse(bounded(input));
  if (!parsed.success) return fail('invalid_request');
  if (!context || context.db !== getAdminDb() || !context.transaction) return fail('routing_unverified', 409);
  const scope = parsed.data;
  await nativeScope(context, scope);
  const saved = readStored(await context.transaction.get(savedRef(context, scope)), scope);
  const rules = saved?.rules || [];
  const printers = await references(context, scope, rules);
  return Object.freeze({ scope: Object.freeze(scope), revision: saved?.revision ?? null, rules: immutableRules(rules), printers, dispatchAuthorized: false as const });
}
async function authorize(context: NativeTransactionContext, identity: VerifiedIdentity, scope: Scope, permission: string) {
  const saved = await context.transaction.get(context.db.collection('platformAdminControl').doc('access-v1'));
  const policy = policySchema.safeParse(saved.data());
  if (!saved.exists || !policy.success || !isSuperuser(policy.data, principalKey(identity))) throw new AuthorityError('forbidden');
  await authorizeTransaction(context.transaction, identity, scope, permission, 'location');
}
export async function readSavedPrinterRouting(input: unknown) {
  const session = await requirePlatformSuperuser();
  const parsed = scopeSchema.safeParse(bounded(input));
  if (!parsed.success) return fail('invalid_request');
  const db = getAdminDb();
  return db.runTransaction(async transaction => {
    const context = { db, transaction };
    const scope = parsed.data;
    await authorize(context, session.identity, scope, 'orderfly.catalog:view');
    // Management must retain the owned document's revision so stale catalog
    // references can be replaced. Scope/schema failures are never recoverable.
    await nativeScope(context, scope);
    const saved = readStored(await transaction.get(savedRef(context, scope)), scope);
    const rules = saved?.rules || [];
    let printers: Awaited<ReturnType<typeof references>> = Object.freeze([]);
    let referencesVerified = true;
    try {
      printers = await references(context, scope, rules);
    } catch (error) {
      if (!(error instanceof SavedPrinterRoutingError) || error.code !== 'reference_unverified' || error.status !== 409) throw error;
      referencesVerified = false;
    }
    return Object.freeze({ scope: Object.freeze(scope), revision: saved?.revision ?? null,
      rules: immutableRules(rules), printers, referencesVerified, dispatchAuthorized: false as const });
  }, { readOnly: true });
}
export async function writeSavedPrinterRouting(input: unknown) {
  const session = await requirePlatformSuperuser();
  const parsed = commandSchema.safeParse(bounded(input));
  if (!parsed.success) return fail('invalid_request');
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') return fail('writes_unavailable', 503);
  const { brandId, locationId, expectedRevision, rules } = parsed.data, scope = { brandId, locationId };
  const db = getAdminDb();
  return db.runTransaction(async transaction => {
    const context = { db, transaction };
    await authorize(context, session.identity, scope, 'orderfly.catalog:edit');
    await nativeScope(context, scope);
    const ref = savedRef(context, scope), previous = readStored(await transaction.get(ref), scope);
    if ((previous?.revision ?? 0) !== expectedRevision || expectedRevision === Number.MAX_SAFE_INTEGER) return fail('record_conflict', 409);
    const printers = await references(context, scope, rules);
    const revision = expectedRevision + 1, timestamp = FieldValue.serverTimestamp();
    transaction.create(ref.collection('audit').doc(String(revision)), {
      schemaVersion: 1, actorId: principalKey(session.identity), action: 'printer.routing.save', revision,
      before: previous?.rules ?? null, after: rules, createdAt: timestamp,
    });
    const next = { schemaVersion: 1 as const, id: 'original' as const, ...scope, revision, rules, deletedAt: null,
      createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp };
    if (previous) transaction.set(ref, next); else transaction.create(ref, next);
    return Object.freeze({ scope: Object.freeze(scope), revision, rules: immutableRules(rules), printers, referencesVerified: true as const, dispatchAuthorized: false as const });
  });
}

const pickerSchema = scopeSchema.extend({ kind: z.enum(['product', 'category']), after: id.optional() }).strict();
function displayText(value: unknown, maximum = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value)) return fail('reference_unverified', 409);
  return value;
}
async function productForSample(context: NativeTransactionContext, scope: Scope, productId: string) {
  const product = await native(context, 'products', productId);
  if (field(product, 'brandId') !== scope.brandId || field(product, 'isActive') !== true) return fail('reference_unverified', 409);
  membership(product, scope.locationId, true);
  const name = displayText(field(product, 'productName'));
  const description = field(product, 'description');
  if (description !== undefined && (typeof description !== 'string' || description.length > 4096)
    || isSyntheticProduct({ productName: name, description: description as string | undefined })) return fail('reference_unverified', 409);
  const categoryId = field(product, 'categoryId');
  if (typeof categoryId !== 'string' || categoryId.length > 128 || !id.safeParse(categoryId).success) return fail('reference_unverified', 409);
  const category = await native(context, 'categories', categoryId);
  if (field(category, 'isActive') !== true) return fail('reference_unverified', 409);
  membership(category, scope.locationId, false);
  return { id: productId, name, categoryId };
}
/** Bounded named choices, never a global catalog query or write authority. */
export async function readPrinterRoutingCatalog(input: unknown) {
  const session = await requirePlatformSuperuser();
  const parsed = pickerSchema.safeParse(bounded(input));
  if (!parsed.success) return fail('invalid_request');
  const { brandId, locationId, kind, after } = parsed.data, scope = { brandId, locationId }, db = getAdminDb();
  return db.runTransaction(async transaction => {
    const context = { db, transaction };
    await authorize(context, session.identity, scope, 'orderfly.catalog:view');
    await nativeScope(context, scope);
    let query = kind === 'product' ? db.collection('products').where('brandId', '==', brandId)
      : db.collection('categories').where('locationIds', 'array-contains', locationId);
    query = query.orderBy('__name__');
    if (after) query = query.startAfter(after);
    const saved = await transaction.get(query.limit(51));
    if (saved.size > 51) return fail('routing_unavailable', 503);
    const items: Array<{ id: string; name: string; categoryId?: string }> = [];
    for (const doc of saved.docs.slice(0, 50)) {
      if (!id.safeParse(doc.id).success) return fail('reference_unverified', 409);
      const row = doc.data();
      if (!row || typeof row !== 'object') return fail('reference_unverified', 409);
      if (kind === 'product' && field(row, 'brandId') !== brandId) return fail('reference_unverified', 409);
      if (field(row, 'isActive') !== true || field(row, 'deletedAt') != null || field(row, 'deleted') === true || field(row, 'isDeleted') === true || field(row, 'isTestData') === true) continue;
      // A brand-owned product may belong to another location; omit that valid
      // non-applicable row while preserving the native query continuation.
      const locationIds = field(row, 'locationIds');
      if (!Array.isArray(locationIds) || locationIds.length > 100) return fail('reference_unverified', 409);
      const ids: string[] = [];
      for (let index = 0; index < locationIds.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(locationIds, String(index));
        const value = descriptor && 'value' in descriptor ? descriptor.value : undefined;
        if (typeof value !== 'string' || value.length > 128 || !id.safeParse(value).success) return fail('reference_unverified', 409);
        ids.push(value);
      }
      if (new Set(ids).size !== ids.length) return fail('reference_unverified', 409);
      if (kind === 'product' && ids.length > 0 && !ids.includes(locationId)) continue;
      membership(row, locationId, kind === 'product');
      if (kind === 'product') {
        const name = displayText(field(row, 'productName')), description = field(row, 'description');
        if (description !== undefined && (typeof description !== 'string' || description.length > 4096)) return fail('reference_unverified', 409);
        if (isSyntheticProduct({ productName: name, description: description as string | undefined })) continue;
        items.push(await productForSample(context, scope, doc.id));
      } else {
        const checked = await native(context, 'categories', doc.id);
        membership(checked, locationId, false);
        items.push({ id: doc.id, name: displayText(field(checked, 'categoryName')) });
      }
    }
    return { scope, kind, items, nextCursor: saved.docs.length > 50 ? saved.docs[49].id : null };
  }, { readOnly: true });
}
const sampleSchema = scopeSchema.extend({ rules: rulesSchema, deliveryType: z.enum(['Pickup', 'Delivery']),
  items: z.array(z.object({ productId: id, quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(20) }).strict();
/** Sample-only preview. Names/category IDs come from current native records;
 * caller supplies no arbitrary order, payment or line labels. Never creates jobs.
 */
export async function previewPrinterRoutingSample(input: unknown) {
  const session = await requirePlatformSuperuser();
  const parsed = sampleSchema.safeParse(bounded(input));
  if (!parsed.success) return fail('invalid_request');
  const { brandId, locationId, rules, deliveryType, items } = parsed.data, scope = { brandId, locationId }, db = getAdminDb();
  return db.runTransaction(async transaction => {
    const context = { db, transaction };
    await authorize(context, session.identity, scope, 'orderfly.catalog:view');
    await nativeScope(context, scope);
    const printers = await references(context, scope, rules);
    const lines: PrinterRoutingLine[] = [];
    for (const [index, item] of items.entries()) {
      const product = await productForSample(context, scope, item.productId);
      lines.push({ lineId: `sample-${index}`, ...scope, itemType: 'product', productId: product.id,
        categoryId: product.categoryId, name: product.name, quantity: item.quantity });
    }
    const preview = previewPrinterRouting({ scope, deliveryType, rules, lines,
      printers: printers.map(printer => ({ configuration: printer.configuration, deleted: false })) });
    const result = { scope, sampleOnly: true as const, ...preview, lines: lines.map(({ lineId, name, quantity }) => ({ lineId, name, quantity })),
      printers: printers.map(printer => ({ id: printer.configuration.id, name: printer.configuration.name })) };
    if (JSON.stringify(result).length > 131072) return fail('invalid_request');
    return result;
  }, { readOnly: true });
}
