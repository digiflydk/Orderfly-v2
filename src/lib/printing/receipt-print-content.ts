import 'server-only';
import { z } from 'zod';
import type { OrderDetail } from '@/types';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { storedPrinterSchema } from './storage';
import { DEFAULT_KITCHEN_SETTINGS, kitchenSettingsSchema } from '@/lib/receipts/kitchen-settings';
import { DEFAULT_RECEIPT_SETTINGS, receiptSettingsSchema } from '@/lib/receipts/settings';
import { projectKitchenReceipt, type DeliveryPrintDetails } from '@/lib/receipts/kitchen-preview';
import { projectReceipt } from '@/lib/receipts/preview';
import { projectReceiptBrand } from '@/lib/receipts/brand-identity';
import { kitchenCatalogLabelApplies } from '@/lib/receipts/kitchen-category-scope';
import { renderKitchenReceiptSvg, renderCustomerReceiptSvg } from '@/lib/receipts/print-layout';
import { rasterizeReceipt, resolveReceiptLogo } from '@/lib/receipts/print-raster';

import { managedDeliveryBindingSchema, deliveryIntervalSchema, deliveryCreateResultSchema } from '@/lib/delivery/provider-contract';
import { storedDeliveryQuoteSchema } from '@/lib/delivery/quotes/schema';
import { projectCustomerDeliveryTracking } from '@/lib/delivery/tracking';
import { bookingIntentSchema } from '@/lib/delivery/booking/state';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const scopeSchema = z.object({ orderId: id, brandId: id, locationId: id, printerId: id }).strict();
type Scope = z.infer<typeof scopeSchema>;
const text = (max: number) => z.string().max(max).refine(s => !/[\p{Cf}\p{Cs}\u0000-\u0008\u000b-\u001f\u007f]/u.test(s));
const money = z.number().finite().min(0).max(100_000_000);
const quantity = z.number().int().min(1).max(999);
const selection = z.object({ groupName: text(160), products: z.array(z.object({ id, name: text(160) })).max(100) });
const item = z.object({ id, name: text(160), quantity, itemType: z.enum(['product', 'combo']),
  toppings: z.array(text(160)).max(50).optional(), comboSelections: z.array(selection).max(30).optional(),
  unitPrice: money.optional(), totalPrice: money.optional() });
const invoiceSchema = z.object({ number: text(160), currency: z.string().regex(/^[A-Z]{3}$/),
  seller: z.object({ legalName: text(1300), tradingName: text(300), registrationNumber: text(300), address: text(1300) }),
  fulfillmentLocation: z.object({ name: text(300) }), customer: z.object({ name: text(300), email: text(300) }),
  lines: z.array(z.object({ description: text(300), quantity, unitAmount: money, totalAmount: money })).min(1).max(100),
  subtotal: money, itemDiscount: money, orderDiscount: money, deliveryFee: money, bagFee: money, adminFee: money,
  vatAmount: money, totalAmount: money, paymentMethod: z.enum(['Stripe', 'Cash', 'CardInRestaurant']) });
const orderSchema = z.object({ brandId: id, locationId: id,
  brandName: text(300).optional().default(''), locationName: text(300).optional().default(''),
  customerName: text(300).optional().default(''), customerContact: text(300).optional().default(''),
  customerDetails: z.object({ address: text(1300).optional(), phone: text(50).optional(), deliveryInstructions: text(400).optional() }).optional(),
  status: text(50), paymentStatus: text(50).optional(), paymentMethod: text(50).optional(),
  deliveryType: z.enum(['Pickup', 'Delivery']), deliveryTime: text(300).optional(),
  productItems: z.array(item).min(1).max(100), totalAmount: money.optional(), refundedAmountOre: money.optional(),
  paymentDetails: z.object({ subtotal: money, discountTotal: money, deliveryFee: money,
    bagFee: money.optional(), adminFee: money.optional(), tips: money.optional(), vatAmount: money.optional() }).optional(),
  invoice: invoiceSchema.optional() });
const fail = (): never => { throw new Error('receipt_content_unavailable'); };
function timestamp(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined;
  const candidate = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate() : value;
  const result = candidate instanceof Date ? candidate : typeof candidate === 'string' || typeof candidate === 'number' ? new Date(candidate) : null;
  if (!result || !Number.isFinite(result.getTime())) return fail();
  return result;
}
function validRow(row: FirebaseFirestore.DocumentData | undefined, expectedId: string): row is FirebaseFirestore.DocumentData {
  return !!row && (row.id === undefined || row.id === expectedId) && row.deleted !== true && row.isDeleted !== true
    && row.deletedAt == null && row.isTestData !== true;
}

async function categoryNames(context: NativeTransactionContext, s: Scope, order: OrderDetail) {
  const { db, transaction: tx } = context, labels: Record<string, string> = {}, categories = new Map<string, string | undefined>();
  for (const productId of new Set(order.productItems.filter(p => p.itemType !== 'combo').map(p => p.id).filter((value): value is string => typeof value === 'string'))) {
    const product = await tx.get(db.collection('products').doc(productId)), data = product.data();
    if (!product.exists || !kitchenCatalogLabelApplies(data, productId, s.brandId, s.locationId, true) || !id.safeParse(data?.categoryId).success) continue;
    const categoryId = data!.categoryId as string;
    if (!categories.has(categoryId)) {
      const category = await tx.get(db.collection('categories').doc(categoryId)), row = category.data();
      const name = text(160).safeParse(row?.categoryName);
      categories.set(categoryId, category.exists && kitchenCatalogLabelApplies(row, categoryId, s.brandId, s.locationId, false) && name.success && name.data.trim() ? name.data.trim() : undefined);
    }
    const label = categories.get(categoryId); if (label) labels[productId] = label;
  }
  return labels;
}
async function managedDeliveryDetails(context: NativeTransactionContext, scope: Scope, raw: FirebaseFirestore.DocumentData): Promise<DeliveryPrintDetails | undefined> {
  if (raw.deliveryType !== 'Delivery' || raw.managedDelivery === undefined) return undefined;
  const managed = managedDeliveryBindingSchema.safeParse(raw.managedDelivery);
  if (!managed.success) return fail();
  const { db, transaction: tx } = context;
  const orderRef = db.collection('orders').doc(scope.orderId);
  const [quoteRow, estimateRow, attemptRow, resultRow, stateRow, cancellationRow] = await Promise.all([
    tx.get(db.collection('deliveryQuotes').doc(managed.data.quoteRef)),
    tx.get(orderRef.collection('deliveryEstimates').doc('current')),
    tx.get(orderRef.collection('deliveryAttempts').doc('original')),
    tx.get(orderRef.collection('deliveryDispatchResults').doc('original')),
    tx.get(orderRef.collection('deliveryState').doc('current')),
    tx.get(orderRef.collection('deliveryCancellation').doc('original')),
  ]);
  const quote = storedDeliveryQuoteSchema.safeParse(quoteRow.data());
  let requested: DeliveryPrintDetails['requested'] = null;
  if (quoteRow.exists) {
    if (!quote.success || quote.data.quoteRef !== managed.data.quoteRef || quote.data.contentDigest !== managed.data.requestDigest
      || quote.data.binding.brandId !== scope.brandId || quote.data.binding.locationId !== scope.locationId || quote.data.binding.providerId !== managed.data.providerId) return fail();
    const desired = quote.data.fulfillment.desiredDelivery;
    requested = desired.kind === 'asap' ? { kind: 'asap' } : { kind: 'scheduled', ...desired.interval };
  }
  let reliablePickup: DeliveryPrintDetails['reliablePickup'] = null;
  const estimate = estimateRow.data(), attempt = bookingIntentSchema.safeParse(attemptRow.data());
  if (estimate?.pickupReliable === true && attempt.success && attempt.data.state === 'booked'
    && attempt.data.scope.brandId === scope.brandId && attempt.data.scope.locationId === scope.locationId && attempt.data.scope.orderId === scope.orderId
    && attempt.data.requestDigest === managed.data.requestDigest && attempt.data.provider === managed.data.providerId
    && estimate.brandId === scope.brandId && estimate.locationId === scope.locationId && estimate.orderId === scope.orderId
    && estimate.provider === managed.data.providerId && estimate.providerDeliveryId === attempt.data.providerDeliveryId) {
    const interval = deliveryIntervalSchema.safeParse(estimate.pickup);
    if (interval.success) reliablePickup = interval.data;
  }
  // Booking ETA is available before the first verified courier callback. Keep
  // it explicitly planned, and never substitute the customer's delivery time.
  let plannedPickup: DeliveryPrintDetails['plannedPickup'] = null;
  const record = resultRow.data(), result = deliveryCreateResultSchema.safeParse(record?.result);
  if (attempt.success && attempt.data.state === 'booked' && result.success && result.data.kind === 'accepted'
    && attempt.data.scope.brandId === scope.brandId && attempt.data.scope.locationId === scope.locationId && attempt.data.scope.orderId === scope.orderId
    && attempt.data.provider === managed.data.providerId && attempt.data.requestDigest === managed.data.requestDigest
    && record?.scope?.brandId === scope.brandId && record.scope.locationId === scope.locationId && record.scope.orderId === scope.orderId
    && record.providerId === managed.data.providerId && record.requestDigest === managed.data.requestDigest && record.attemptRef === attempt.data.reference
    && result.data.providerDeliveryId === attempt.data.providerDeliveryId) {
    plannedPickup = result.data.pickupInterval;
  }
  const tracking = projectCustomerDeliveryTracking(scope.orderId, raw, attemptRow.data(), record, stateRow.data(), estimate, cancellationRow.data());
  const pickupUnavailable = raw.status === 'Canceled' || tracking?.deliveryStatus === 'cancelled' ? 'cancelled'
    : tracking?.deliveryStatus === 'failed' ? 'failed' : undefined;
  if (pickupUnavailable) { reliablePickup = null; plannedPickup = null; }
  return { address: raw.customerDetails?.address ?? '', requested, reliablePickup, plannedPickup, ...(pickupUnavailable ? { pickupUnavailable } : {}) };
}

async function nativeSnapshot(context: NativeTransactionContext, input: Scope) {
  const parsed = scopeSchema.safeParse(input); if (!parsed.success || context.db !== getAdminDb()) return fail();
  const s = parsed.data, { db, transaction: tx } = context;
  const [orderRow, brandRow, locationRow, printerRow, kitchenRow, receiptRow] = await Promise.all([
    tx.get(db.collection('orders').doc(s.orderId)), tx.get(db.collection('brands').doc(s.brandId)),
    tx.get(db.collection('locations').doc(s.locationId)),
    tx.get(db.collection('locations').doc(s.locationId).collection('printers').doc(s.printerId)),
    tx.get(db.collection('kitchenReceiptSettings').doc(s.brandId)), tx.get(db.collection('receiptSettings').doc(s.brandId)),
  ]);
  const raw = orderRow.data(), brand = brandRow.data(), location = locationRow.data();
  const printer = storedPrinterSchema.safeParse(printerRow.data()), orderParsed = orderSchema.safeParse(raw);
  if (!orderRow.exists || orderRow.id !== s.orderId || !validRow(raw, s.orderId) || !orderParsed.success
    || orderParsed.data.brandId !== s.brandId || orderParsed.data.locationId !== s.locationId
    || !brandRow.exists || !validRow(brand, s.brandId) || !locationRow.exists || !validRow(location, s.locationId)
    || location.brandId !== s.brandId || !printerRow.exists || !printer.success
    || printer.data.configuration.id !== s.printerId || printer.data.configuration.brandId !== s.brandId
    || printer.data.configuration.locationId !== s.locationId || printer.data.configuration.state !== 'active'
    || printer.data.configuration.manufacturer !== 'star' || printer.data.configuration.transport !== 'cloudprnt-http') return fail();
  const delivery = await managedDeliveryDetails(context, s, raw!);
  const width = printer.data.configuration.paperWidthMm;
  if (width !== 58 && width !== 80) return fail();
  const kitchenRecord = z.object({ schemaVersion: z.literal(1), brandId: z.literal(s.brandId), revision: z.number().int().positive().safe(), settings: kitchenSettingsSchema }).strict();
  const receiptRecord = z.object({ schemaVersion: z.literal(1), brandId: z.literal(s.brandId), revision: z.number().int().positive().safe(), settings: receiptSettingsSchema }).strict();
  const kitchen = kitchenRow.exists ? kitchenRecord.safeParse(kitchenRow.data()) : null;
  const receipt = receiptRow.exists ? receiptRecord.safeParse(receiptRow.data()) : null;
  if (kitchen && !kitchen.success || receipt && !receipt.success) return fail();
  // Explicit projection removes unrelated provider/session/customer fields before rendering.
  const order = { ...orderParsed.data, id: s.orderId, createdAt: timestamp(raw!.createdAt), paidAt: timestamp(raw!.paidAt),
    fulfillmentAt: timestamp(raw!.fulfillmentAt) } as OrderDetail;
  return { order, brand, delivery, kitchenSettings: { ...(kitchen?.success ? kitchen.data.settings : DEFAULT_KITCHEN_SETTINGS), paperWidthMm: width },
    receiptSettings: { ...(receipt?.success ? receipt.data.settings : DEFAULT_RECEIPT_SETTINGS), paperWidthMm: width } };
}

/** Caller owns authorization/manifest validation. This helper only reads authoritative
 * scoped display facts in that same native attempt; it never grants print authority. */
export async function prepareKitchenPrintSnapshot(context: NativeTransactionContext, input: Scope & { lineIds?: string[] }) {
  const { lineIds, ...s } = input, snapshot = await nativeSnapshot(context, s);
  if (lineIds !== undefined) {
    if (!Array.isArray(lineIds) || !lineIds.length || lineIds.length > 100 || new Set(lineIds).size !== lineIds.length) return fail();
    snapshot.order.productItems = lineIds.map(lineId => {
      if (!/^line-(0|[1-9][0-9]{0,2})$/.test(lineId)) return fail();
      return snapshot.order.productItems[Number(lineId.slice(5))] ?? fail();
    });
  }
  const categories = await categoryNames(context, s, snapshot.order);
  return { settings: snapshot.kitchenSettings, order: projectKitchenReceipt(snapshot.order, categories, snapshot.delivery) };
}

/** Called only after the manual-request service authorizes actor/order/printer.
 * Native snapshot first, bounded logo retrieval and CPU rendering outside transaction.
 * The request service rechecks source order and device revisions before storing bytes. */
export async function prepareReceiptPrintContent(input: Scope & { kind: 'kitchen' | 'customer' }) {
  const { kind, ...scope } = input;
  if (kind !== 'kitchen' && kind !== 'customer') return fail();
  const db = getAdminDb();
  if (kind === 'kitchen') {
    const snapshot = await db.runTransaction(transaction => prepareKitchenPrintSnapshot({ db, transaction }, scope), { readOnly: true });
    return rasterizeReceipt(renderKitchenReceiptSvg(snapshot.settings, snapshot.order));
  }
  const snapshot = await db.runTransaction(transaction => nativeSnapshot({ db, transaction }, scope), { readOnly: true });
  if (!snapshot.order.invoice && (!snapshot.order.paymentDetails || snapshot.order.totalAmount === undefined
    || snapshot.order.productItems.some(p => p.unitPrice === undefined || p.totalPrice === undefined))) return fail();
  const order = projectReceipt(snapshot.order, projectReceiptBrand(snapshot.brand), snapshot.delivery);
  const logoDataUri = order.logoUrl ? await resolveReceiptLogo(order.logoUrl) : undefined;
  return rasterizeReceipt(renderCustomerReceiptSvg(snapshot.receiptSettings, order, { logoDataUri }));
}
