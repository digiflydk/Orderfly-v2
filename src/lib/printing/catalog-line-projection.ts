import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { PrinterRoutingLine } from './routing-preview';

/** Native reads only. This snapshot is not actor, payment, write or commit authority. */
export const PRINT_CATALOG_PROJECTION_LIMITS = Object.freeze({ lines: 50, modifiers: 8, locations: 100, outputCodeUnits: 32768 });
export class PrintCatalogProjectionError extends Error {
  constructor(readonly code: 'invalid_reference' | 'invalid_catalog' | 'invalid_order' | 'combo_requires_projection' | 'projection_too_large') { super(code); }
}
const fail = (code: PrintCatalogProjectionError['code']): never => { throw new PrintCatalogProjectionError(code); };
type Row = Record<string, unknown>;
function row(value: unknown, code: PrintCatalogProjectionError['code']): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail(code);
  return value as Row;
}
// Read only named data fields. Never traverse an order's customer/provider payload.
function field(data: Row, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(data, name);
  if (descriptor && !('value' in descriptor)) return fail('invalid_catalog');
  return descriptor?.value;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128 || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) return fail('invalid_reference');
  return value;
}
function array(value: unknown, maximum: number, code: PrintCatalogProjectionError['code']): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return fail(code);
  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor || !('value' in descriptor)) return fail(code);
    copy.push(descriptor.value);
  }
  return copy;
}
function identity(data: Row, expected: string): void {
  const storedId = field(data, 'id');
  if (storedId !== undefined && storedId !== expected) fail('invalid_catalog');
  for (const key of ['deleted', 'isDeleted', 'isTestData']) {
    const value = field(data, key);
    if (value !== undefined && value !== false) fail('invalid_catalog');
  }
  const deletedAt = field(data, 'deletedAt');
  if (deletedAt !== undefined && deletedAt !== null) fail('invalid_catalog');
}
function nativeLocations(data: Row, locationId: string, allowGlobal: boolean): void {
  const ids = array(field(data, 'locationIds'), PRINT_CATALOG_PROJECTION_LIMITS.locations, 'invalid_catalog').map(identifier);
  if (new Set(ids).size !== ids.length || (!ids.length && !allowGlobal)
    || (ids.length > 0 && !ids.includes(locationId))) fail('invalid_catalog');
}
type ProjectedLine = Readonly<Omit<PrinterRoutingLine, 'modifiers'> & { modifiers?: readonly string[] }>;

/** Re-run in each fresh caller-owned native transaction attempt. No I/O outside it.
 * Product-only v1 rejects combos rather than silently losing their components.
 */
export async function projectNativePrintCatalog(context: NativeTransactionContext, input: unknown) {
  const request = row(input, 'invalid_reference');
  let keys = 0;
  for (const key in request) if (++keys > 3 || !['orderId', 'brandId', 'locationId'].includes(key)) fail('invalid_reference');
  const orderId = identifier(field(request, 'orderId')), brandId = identifier(field(request, 'brandId')), locationId = identifier(field(request, 'locationId'));
  if (!context || context.db !== getAdminDb() || !context.transaction) fail('invalid_reference');
  const { db, transaction } = context;
  const read = async (collection: string, id: string) => {
    const saved = await transaction.get(db.collection(collection).doc(id));
    if (!saved.exists || saved.id !== id) return fail('invalid_catalog');
    const data = row(saved.data(), 'invalid_catalog'); identity(data, id); return data;
  };
  const [order, brand, location] = await Promise.all([read('orders', orderId), read('brands', brandId), read('locations', locationId)]);
  if (field(order, 'brandId') !== brandId || field(order, 'locationId') !== locationId || field(location, 'brandId') !== brandId) fail('invalid_catalog');
  for (const data of [brand, location]) {
    const active = field(data, 'isActive');
    if (active !== undefined && active !== true) fail('invalid_catalog');
  }
  const deliveryType = field(order, 'deliveryType');
  if (deliveryType !== 'Pickup' && deliveryType !== 'Delivery') fail('invalid_order');
  const source = array(field(order, 'productItems'), PRINT_CATALOG_PROJECTION_LIMITS.lines, 'invalid_order');
  if (!source.length) fail('invalid_order');
  let textUnits = 0;
  function text(value: unknown): string {
    if (typeof value !== 'string' || !value.length || value.length > 160) return fail('invalid_order');
    textUnits += value.length;
    if (textUnits > PRINT_CATALOG_PROJECTION_LIMITS.outputCodeUnits) return fail('projection_too_large');
    if (/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value) || !value.trim()) return fail('invalid_order');
    return value;
  }
  // Preflight all selected fields/collection bounds before catalog reads. Unknown
  // prices/customer/provider fields are deliberately neither read nor serialized.
  const prepared = source.map((entry, index) => {
    const item = row(entry, 'invalid_order');
    const kind = field(item, 'itemType');
    if (kind === 'combo' || field(item, 'comboSelections') !== undefined) return fail('combo_requires_projection');
    if (kind !== 'product') return fail('invalid_order');
    const quantity = field(item, 'quantity');
    if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 99) return fail('invalid_order');
    const rawModifiers = field(item, 'toppings');
    const modifiers = rawModifiers === undefined ? [] : array(rawModifiers, PRINT_CATALOG_PROJECTION_LIMITS.modifiers, 'invalid_order');
    const toppingIds = field(item, 'toppingIds');
    if (toppingIds !== undefined) {
      const ids = array(toppingIds, PRINT_CATALOG_PROJECTION_LIMITS.modifiers, 'invalid_order').map(identifier);
      if (ids.length !== modifiers.length || new Set(ids).size !== ids.length) fail('invalid_order');
    }
    // There is no canonical per-line kitchen-note field in MinimalCartItem or
    // checkoutItems. A future reviewed adapter must define it; never drop one.
    if (field(item, 'kitchenNote') !== undefined) fail('invalid_order');
    return { lineId: `line-${index}`, productId: identifier(field(item, 'id')), name: text(field(item, 'name')),
      quantity: quantity as number, modifiers: modifiers.map(text) };
  });
  const products = new Map<string, Row>();
  for (const id of new Set(prepared.map(line => line.productId))) {
    const product = await read('products', id);
    if (field(product, 'brandId') !== brandId || field(product, 'isActive') !== true) fail('invalid_catalog');
    nativeLocations(product, locationId, true);
    products.set(id, product);
  }
  const categories = new Map<string, Row>();
  for (const product of products.values()) {
    const categoryId = identifier(field(product, 'categoryId'));
    if (categories.has(categoryId)) continue;
    const category = await read('categories', categoryId);
    // Actual category writers omit brandId; native location membership owns it.
    // A contradictory legacy brand field is ambiguous and fails closed.
    const legacyBrand = field(category, 'brandId');
    if ((legacyBrand !== undefined && legacyBrand !== brandId) || field(category, 'isActive') !== true) fail('invalid_catalog');
    nativeLocations(category, locationId, false);
    categories.set(categoryId, category);
  }
  const lines: ProjectedLine[] = prepared.map(line => Object.freeze({ ...line, brandId, locationId, itemType: 'product' as const,
    categoryId: identifier(field(products.get(line.productId)!, 'categoryId')), modifiers: Object.freeze([...line.modifiers]) }));
  const result = { orderId, scope: Object.freeze({ brandId, locationId }), deliveryType,
    lines: Object.freeze(lines), dispatchAuthorized: false as const };
  if (JSON.stringify(result).length > PRINT_CATALOG_PROJECTION_LIMITS.outputCodeUnits) fail('projection_too_large');
  return Object.freeze(result);
}
