import 'server-only';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { loadAuthorizedDeliveryTracking } from '@/lib/delivery/tracking-server';
import { createHash } from 'node:crypto';
import { FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflyReadGrants, requireOrderflyAccess } from '@/lib/access/orderfly-session';
import { getOrderTerminalActor, authorizeOrderTerminalTransaction, type OrderTerminalAuthSource } from '@/lib/terminal-auth/access';
import { AuthorityError } from '@/lib/access/authority';
import { analyticsCalendarDay } from '@/lib/analytics/date-range';
import type { OrderStatus } from '@/types';
import type { TerminalLocation, TerminalOrder, TerminalQuery, TerminalReadResult } from './terminal-types';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { return analyticsCalendarDay(value) === value; } catch { return false; }
});
const querySchema = z.object({
  brandId: id.optional(), locationId: id.optional(), view: z.enum(['board', 'history', 'preorders']).default('board'),
  cursor: z.string().max(4096).optional(), search: z.string().trim().max(100).optional(),
  dateFrom: day.optional(), dateTo: day.optional(),
}).strict().refine(q => Boolean(q.brandId) === Boolean(q.locationId))
  .refine(q => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo);
const ACTIVE: OrderStatus[] = ['Received', 'In Progress', 'Ready'];
const ALL: OrderStatus[] = ['Pending', ...ACTIVE, 'Completed', 'Delivered', 'Canceled', 'Error'];
const PAGE_PER_STATUS = 50;
const MAX_LOCATIONS = 200;
export class TerminalReadError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const invalid = (): never => { throw new TerminalReadError('terminal_invalid'); };
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const amount = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;
function iso(value: unknown): string | null {
  try {
    const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value)
      : value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : null;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch { return null; }
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function projectTerminalOrder(orderId: string, value: unknown): TerminalOrder | null {
  const data = record(value);
  if (!ALL.includes(data.status as OrderStatus) || !['Paid', 'Pending', 'Failed'].includes(text(data.paymentStatus))
    || !['Pickup', 'Delivery'].includes(text(data.deliveryType))) return null;
  const customer = record(data.customerDetails), collection = record(data.paymentCollection);
  const items = (Array.isArray(data.productItems) ? data.productItems : []).map(raw => {
    const item = record(raw);
    const modifiers = (Array.isArray(item.toppings) ? item.toppings : []).filter((v): v is string => typeof v === 'string');
    for (const rawSelection of Array.isArray(item.comboSelections) ? item.comboSelections : []) {
      const selection = record(rawSelection);
      for (const product of Array.isArray(selection.products) ? selection.products : []) {
        const name = text(record(product).name);
        if (name) modifiers.push([text(selection.groupName), name].filter(Boolean).join(': '));
      }
    }
    return { name: text(item.name), quantity: amount(item.quantity), unitPrice: amount(item.unitPrice), totalPrice: amount(item.totalPrice), modifiers };
  });
  const projected: TerminalOrder = {
    managedDelivery: data.managedDelivery != null,
    id: orderId, brandId: text(data.brandId), locationId: text(data.locationId), brandName: text(data.brandName), locationName: text(data.locationName),
    customerName: text(data.customerName), customerContact: text(data.customerContact), customerPhone: text(customer.phone),
    deliveryAddress: text(customer.address), notes: text(customer.deliveryInstructions), createdAt: iso(data.createdAt), fulfillmentAt: iso(data.fulfillmentAt),
    deliveryTime: text(data.deliveryTime), deliveryType: data.deliveryType as TerminalOrder['deliveryType'], status: data.status as OrderStatus,
    paymentStatus: data.paymentStatus as TerminalOrder['paymentStatus'], paymentMethod: text(data.paymentMethod), totalAmount: amount(data.totalAmount),
    refundedAmountOre: amount(data.refundedAmountOre), items,
    ...(iso(collection.receivedAt) && ['cash', 'card'].includes(text(collection.method)) ? {
      paymentCollection: { receivedAt: iso(collection.receivedAt)!, employeeId: text(collection.employeeId), employeeName: text(collection.employeeName), method: collection.method as 'cash' | 'card' },
    } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(projected), 'utf8') > 65536) throw new TerminalReadError('terminal_order_too_large', 409);
  return projected;
}
function matches(order: TerminalOrder, q: z.infer<typeof querySchema>, today: string): boolean {
  const future = order.fulfillmentAt !== null && analyticsCalendarDay(order.fulfillmentAt) > today;
  if (q.view === 'board' && future || q.view === 'preorders' && !future) return false;
  // An unverified online payment must not enter the kitchen queues. Accepted
  // unpaid pickup remains visible, but completion is separately payment-gated.
  if (q.view !== 'history' && order.paymentStatus !== 'Paid'
    && !(order.paymentMethod === 'PayAtPickup' && order.deliveryType === 'Pickup' && order.paymentStatus === 'Pending')) return false;
  if (q.dateFrom || q.dateTo) {
    if (!order.createdAt) return false;
    const createdDay = analyticsCalendarDay(order.createdAt);
    if (q.dateFrom && createdDay < q.dateFrom || q.dateTo && createdDay > q.dateTo) return false;
  }
  const needle = q.search?.toLocaleLowerCase('da-DK');
  return !needle || [order.id, order.customerName, order.customerContact, order.customerPhone].join(' ').toLocaleLowerCase('da-DK').includes(needle);
}

/** Each request revalidates grants. Cursor selects a position, never authority. */
export async function readTerminalOrders(input: TerminalQuery = {}, now = new Date(), source: OrderTerminalAuthSource = 'admin'): Promise<TerminalReadResult> {
  const parsed = querySchema.safeParse(input);
  if (!parsed.success || !Number.isFinite(now.getTime())) return invalid();
  const q = parsed.data, db = getAdminDb();
  const actor = source === 'terminal' ? await getOrderTerminalActor('terminal') : null;
  const grants = actor?.kind === 'terminal' ? [{ brandId: actor.session.brandId, locationIds: [actor.session.locationId] }] : await orderflyReadGrants('orderfly.orders:view');
  if (grants.length > MAX_LOCATIONS) throw new TerminalReadError('terminal_scope_too_large', 409);
  const locations: TerminalLocation[] = [];
  for (const grant of grants) {
    const brand = await db.collection('brands').doc(grant.brandId).get();
    if (!brand.exists) continue;
    // A bounded single equality query needs no new composite index. Check
    // native ownership again, even though nativeGrants also validates it.
    const docs = grant.locationIds === null
      ? (await db.collection('locations').where('brandId', '==', grant.brandId).limit(MAX_LOCATIONS + 1).get()).docs
      : await Promise.all(grant.locationIds.slice(0, MAX_LOCATIONS + 1).map(locationId => db.collection('locations').doc(locationId).get()));
    if (docs.length > MAX_LOCATIONS || (grant.locationIds?.length ?? 0) > MAX_LOCATIONS) throw new TerminalReadError('terminal_scope_too_large', 409);
    for (const doc of docs) {
      const location = doc.data();
      if (!doc.exists || location?.brandId !== grant.brandId) continue;
      locations.push({ brandId: grant.brandId, brandName: text(brand.data()?.name) || text(brand.data()?.brandName), locationId: doc.id,
        locationName: text(location.name) || text(location.locationName) });
      if (locations.length > MAX_LOCATIONS) throw new TerminalReadError('terminal_scope_too_large', 409);
    }
  }
  locations.sort((a, b) => a.brandId.localeCompare(b.brandId) || a.locationId.localeCompare(b.locationId));
  const selected = q.brandId ? locations.find(l => l.brandId === q.brandId && l.locationId === q.locationId) : locations[0];
  if (q.brandId && !selected) throw new AuthorityError('forbidden');
  const empty: TerminalReadResult = { orders: [], locations, selectedBrandId: selected?.brandId ?? null,
    selectedLocationId: selected?.locationId ?? null, canEdit: false, serverTime: now.toISOString(), nextCursor: null, hasMore: false };
  if (!selected) return empty;
  let canEdit = false;
  if (actor) {
    await db.runTransaction(tx => authorizeOrderTerminalTransaction(tx, actor, { brandId: selected.brandId, locationId: selected.locationId }), { readOnly: true });
    canEdit = true;
  } else {
    await requireOrderflyAccess(selected.brandId, [selected.locationId], 'orderfly.orders:view');
    try { await requireOrderflyAccess(selected.brandId, [selected.locationId], 'orderfly.orders:edit'); canEdit = true; }
    catch (error) { if (!(error instanceof AuthorityError && error.status === 403)) throw error; }
  }
  const statuses = q.view === 'history' ? ALL : ACTIVE;
  const scope = createHash('sha256').update(JSON.stringify([selected.brandId, selected.locationId, q.view, q.search || '', q.dateFrom || '', q.dateTo || ''])).digest('hex');
  let after: Record<string, string | null> = {};
  if (q.cursor) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(q.cursor)) return invalid();
      const cursor = JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8'));
      if (cursor.scope !== scope || !cursor.after || typeof cursor.after !== 'object' || Array.isArray(cursor.after)
        || Object.keys(cursor.after).length !== statuses.length || Object.keys(cursor).sort().join(',') !== 'after,scope') return invalid();
      for (const status of statuses) if (!(status in cursor.after) || !(cursor.after[status] === null || id.safeParse(cursor.after[status]).success)) return invalid();
      after = cursor.after;
    } catch { return invalid(); }
  }
  const next: Record<string, string | null> = {}, orders: TerminalOrder[] = [];
  const today = analyticsCalendarDay(now);
  let responseBytes = 0;
  for (const status of statuses) {
    if (after[status] === null) { next[status] = null; continue; }
    let query = db.collection('orders').where('brandId', '==', selected.brandId)
      .where('locationId', '==', selected.locationId).where('status', '==', status).orderBy(FieldPath.documentId());
    if (after[status]) query = query.startAfter(after[status]);
    const snapshot = await query.limit(PAGE_PER_STATUS + 1).get();
    const docs = snapshot.docs.slice(0, PAGE_PER_STATUS);
    next[status] = snapshot.docs.length > PAGE_PER_STATUS ? docs.at(-1)!.id : null;
    for (const doc of docs) {
      const raw = doc.data();
      if (raw.brandId !== selected.brandId || raw.locationId !== selected.locationId || raw.status !== status) continue;
      if (q.view !== 'history' && raw.paymentStatus !== 'Paid' && (raw.psp || raw.discountReservation !== 'held')) continue;
      const order = projectTerminalOrder(doc.id, raw);
      if (order && matches(order, q, today)) {
        if(order.managedDelivery){
          const identity=actor?null:await verifiedOrderflyIdentity();
          const tracking=await db.runTransaction(async tx=>{
            const fresh=(await tx.get(doc.ref)).data();
            if(!fresh||fresh.brandId!==selected.brandId||fresh.locationId!==selected.locationId)throw new AuthorityError('forbidden');
            if(actor)await authorizeOrderTerminalTransaction(tx,actor,{brandId:selected.brandId,locationId:selected.locationId});
            else await authorizeTransaction(tx,identity!,fresh,'orderfly.orders:view','location');
            return loadAuthorizedDeliveryTracking(tx,doc.id,fresh);
          },{readOnly:true});
          if(tracking)order.managedDeliveryTracking=tracking;
        }
        // Courier completion closes active queues without rewriting kitchen status.
        // Only the freshly authorized, identity-bound tracking projection can hide a row.
        if(q.view!=='history'&&order.managedDeliveryTracking?.deliveryStatus==='delivered')continue;
        responseBytes += Buffer.byteLength(JSON.stringify(order), 'utf8');
        if (responseBytes > 2 * 1024 * 1024) throw new TerminalReadError('terminal_result_too_large', 409);
        orders.push(order);
      }
    }
  }
  const hasMore = Object.values(next).some(value => value !== null);
  // Sorting is for loaded rows only. Cursor order is stable document ID within
  // each status, not a global chronological index; the UI labels partial data.
  orders.sort(q.view === 'history'
    ? (a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id)
    : (a, b) => (a.fulfillmentAt || a.createdAt || '').localeCompare(b.fulfillmentAt || b.createdAt || '') || a.id.localeCompare(b.id));
  return { ...empty, orders, canEdit, hasMore, nextCursor: hasMore ? Buffer.from(JSON.stringify({ scope, after: next })).toString('base64url') : null };
}
