import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { MAX_TOPPINGS_PER_ITEM } from '@/lib/commerce-limits';
import { isSyntheticProduct } from '@/lib/synthetic-product';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { comboPrintSelections } from './combo-print-selection';
import type { PrinterRoutingLine } from './routing-preview';

/** Native reads only. This snapshot is not actor, payment, write or commit authority. */
export const PRINT_CATALOG_PROJECTION_LIMITS = Object.freeze({ lines: 50, modifiers: 8, locations: 100, nativeNameCodeUnits: 160, nativeDescriptionCodeUnits: 4096, outputCodeUnits: 32768 });
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
 * Menu components retain separate identities for native product/category routing.
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
  // Brand lifecycle is canonical Brand.status, checked by the native intent
  // policy. Legacy Brand.isActive must not contradict that policy. This pure
  // projection grants no lifecycle/output authority; location activity remains
  // a separate native catalog requirement.
  const active = field(location, 'isActive');
  if (active !== undefined && active !== true) fail('invalid_catalog');
  const deliveryType = field(order, 'deliveryType');
  if (deliveryType !== 'Pickup' && deliveryType !== 'Delivery') fail('invalid_order');
  const source = array(field(order, 'productItems'), PRINT_CATALOG_PROJECTION_LIMITS.lines, 'invalid_order');
  if (!source.length) fail('invalid_order');
  let textUnits = 0;
  function text(value: unknown, maximum = 160): string {
    if (typeof value !== 'string' || !value.length || value.length > maximum) return fail('invalid_order');
    textUnits += value.length;
    if (textUnits > PRINT_CATALOG_PROJECTION_LIMITS.outputCodeUnits) return fail('projection_too_large');
    if (/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(value) || !value.trim()) return fail('invalid_order');
    return value;
  }
  // Preflight all selected fields/collection bounds before catalog reads. Unknown
  // prices/customer/provider fields are deliberately neither read nor serialized.
  const comboIds = new Set<string>();
  const prepared = source.flatMap((entry, index) => {
    const item = row(entry, 'invalid_order');
    const kind = field(item, 'itemType');
    if (kind !== 'product' && kind !== 'combo') return fail('invalid_order');
    if (kind === 'product' && field(item, 'comboSelections') !== undefined) return fail('invalid_order');
    const quantity = field(item, 'quantity');
    if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 99) return fail('invalid_order');
    const rawModifiers = field(item, 'toppings');
    const modifiers = rawModifiers === undefined ? [] : array(rawModifiers, kind === 'combo' ? MAX_TOPPINGS_PER_ITEM : PRINT_CATALOG_PROJECTION_LIMITS.modifiers, 'invalid_order');
    const toppingIds = field(item, 'toppingIds');
    if (kind === 'product' && toppingIds !== undefined) {
      const ids = array(toppingIds, PRINT_CATALOG_PROJECTION_LIMITS.modifiers, 'invalid_order').map(identifier);
      if (ids.length !== modifiers.length || new Set(ids).size !== ids.length) fail('invalid_order');
    }
    // There is no canonical per-line kitchen-note field in MinimalCartItem or
    // checkoutItems. A future reviewed adapter must define it; never drop one.
    if (field(item, 'kitchenNote') !== undefined) fail('invalid_order');
    const name = text(field(item, 'name')), savedModifiers = modifiers.map(value => text(value));
    if (kind === 'combo') {
      comboIds.add(identifier(field(item, 'id')));
      const comboSelections = array(field(item, 'comboSelections'), 30, 'invalid_order').map(rawGroup => {
        const group = row(rawGroup, 'invalid_order');
        return { groupName: text(field(group, 'groupName')), products: array(field(group, 'products'), 50, 'invalid_order').map(rawProduct => {
          const product = row(rawProduct, 'invalid_order'), raw = field(product, 'modifiers');
          const choices = raw === undefined ? undefined : array(raw, 8, 'invalid_order').map(value => {
            const modifier = row(value, 'invalid_order'), count = field(modifier, 'quantity');
            if (!Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > 99) return fail('invalid_order');
            return { id: identifier(field(modifier, 'id')), quantity: count as number };
          });
          return { id: identifier(field(product, 'id')), name: text(field(product, 'name')), modifiers: choices };
        }) };
      });
      let children;
      try { children = comboPrintSelections({ name, toppings: savedModifiers, comboSelections }); }
      catch { return fail('invalid_order'); }
      return children.map(child => ({ lineId: `line-${index}-group-${child.groupIndex}-product-${child.productIndex}`,
        productId: child.product.id, name: child.product.name, quantity: quantity as number,
        modifiers: child.modifiers, kitchenNote: text(`${name}: ${child.groupName}`, 400) }));
    }
    return [{ lineId: `line-${index}`, productId: identifier(field(item, 'id')), name,
      quantity: quantity as number, modifiers: savedModifiers }];
  });
  if (prepared.length > PRINT_CATALOG_PROJECTION_LIMITS.lines) fail('projection_too_large');
  for (const id of comboIds) {
    const combo = await read('combos', id);
    if (field(combo, 'brandId') !== brandId || field(combo, 'isActive') !== true) fail('invalid_catalog');
    nativeLocations(combo, locationId, true);
  }
  const products = new Map<string, Row>();
  for (const id of new Set(prepared.map(line => line.productId))) {
    const product = await read('products', id);
    if (field(product, 'brandId') !== brandId || field(product, 'isActive') !== true) fail('invalid_catalog');
    // Canonical storefront/checkout exclusion also covers legacy active QA rows
    // without isTestData. Bound both selected strings before its regexes run.
    const productName = field(product, 'productName'), description = field(product, 'description');
    if (typeof productName !== 'string' || !productName.length
      || productName.length > PRINT_CATALOG_PROJECTION_LIMITS.nativeNameCodeUnits
      || (description !== undefined && (typeof description !== 'string'
        || description.length > PRINT_CATALOG_PROJECTION_LIMITS.nativeDescriptionCodeUnits))) fail('invalid_catalog');
    if (isSyntheticProduct({ productName: productName as string, description: description as string | undefined })) fail('invalid_catalog');
    nativeLocations(product, locationId, true);
    products.set(id, product);
  }
  const categories = new Map<string, Row>();
  for (const product of products.values()) {
    const categoryId = identifier(field(product, 'categoryId'));
    if (categories.has(categoryId)) continue;
    const category = await read('categories', categoryId);
    // Actual category writers omit brandId; native location membership owns it.
    // Older writers preserve a stale primary brandId even on shared categories.
    // It is not ownership authority; only native location membership owns them.
    if (field(category, 'isActive') !== true) fail('invalid_catalog');
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
