import 'server-only';
import { loadAuthorizedDeliveryTracking } from '@/lib/delivery/tracking-server';
import { managedDeliveryBindingSchema } from '@/lib/delivery/provider-contract';
import type { CustomerDeliveryTracking } from '@/lib/delivery/tracking';
import type { Firestore } from 'firebase-admin/firestore';
import { customerHasEmail } from '@/lib/customer-identity';
import { normalizeEmail } from '@/lib/integrations/esmeralda-customer-contract';
import { asDate } from '@/lib/loyalty/model';
import { policySchema } from '@/lib/access/policy';
import type { MemberSession, ProgramBrand } from './membership';
import { COLLECTIONS } from './model';

export type PortalOrder = {
  managedDeliveryTracking?: CustomerDeliveryTracking;
  id: string; orderedAt: number; locationName: string; status: string;
  totalAmount: number; refundedAmount: number; netAmount: number;
};
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/');
const SETTLED = new Set(['Received', 'In Progress', 'Ready', 'Completed', 'Delivered']);

// Separate read for /club/historik: no order scans on every card/QR request.
// The current authenticated member/customer and every returned order are checked
// inside the same read transaction. A contact never overrides an explicit ID.
export async function memberOrderHistory(db: Firestore, brand: ProgramBrand, session: MemberSession, now: number): Promise<PortalOrder[]> {
  if (!validId(session.sessionId) || !validId(session.memberId) || !validId(brand.brandId)) return [];
  return db.runTransaction(async tx => {
    const [sessionSnap, memberSnap, brandSnap, policySnap] = await Promise.all([
      tx.get(db.collection(COLLECTIONS.sessions).doc(session.sessionId)),
      tx.get(db.collection(COLLECTIONS.members).doc(session.memberId)),
      tx.get(db.collection('brands').doc(brand.brandId)),
      tx.get(db.collection('platformAdminControl').doc('access-v1')),
    ]);
    const auth = sessionSnap.data(), member = memberSnap.data(), currentBrand = brandSnap.data();
    const policy = policySchema.safeParse(policySnap.data());
    if (!auth || !member || !currentBrand || !policy.success || auth.memberId !== session.memberId
      || auth.brandId !== brand.brandId || auth.revokedAt || !(auth.expiresAt > now) || auth.epoch !== member.sessionEpoch
      || member.status !== 'active' || member.brandId !== brand.brandId || !validId(member.customerId)
      || ['inactive', 'suspended', 'deleted'].includes(currentBrand.status) || currentBrand.deletedAt) return [];
    const companies = policy.data.companies.filter(company => company.active && company.orderflyBrandIds.includes(brand.brandId));
    if (companies.length !== 1 || companies[0].id !== brand.companyId || member.companyId !== brand.companyId) return [];
    const customer = (await tx.get(db.collection('customers').doc(member.customerId))).data();
    const email = typeof member.normalizedEmail === 'string' ? normalizeEmail(member.normalizedEmail) : '';
    if (!email || !customer || customer.brandId !== brand.brandId || customer.deletedAt
      || ['inactive', 'deleted'].includes(customer.status) || !customerHasEmail(customer, email)) return [];
    // Historical contact snapshots sometimes retain case/whitespace. Only known
    // stored spellings of this verified address are queried, never other aliases.
    const contacts = [...new Set([email, customer.email, customer.normalizedEmail,
      ...(Array.isArray(customer.emailAliases) ? customer.emailAliases : [])]
      .filter((value): value is string => typeof value === 'string' && normalizeEmail(value) === email))];
    const scoped = db.collection('orders').where('brandId', '==', brand.brandId);
    const snapshots = await Promise.all([
      tx.get(scoped.where('customerDetails.id', '==', member.customerId)),
      tx.get(scoped.where('customerId', '==', member.customerId)),
      ...contacts.map(contact => tx.get(scoped.where('customerContact', '==', contact))),
    ]);
    const candidates = new Map(snapshots.flatMap(snapshot => snapshot.docs.map(doc => [doc.id, doc.data()] as const)));
    const owned = [...candidates].filter(([, order]) => {
      if (order.brandId !== brand.brandId || !validId(order.locationId)) return false;
      const ids = [order.customerDetails?.id, order.customerId].filter(value => value !== undefined);
      return ids.length ? ids.every(id => id === member.customerId)
        : typeof order.customerContact === 'string' && normalizeEmail(order.customerContact) === email;
    });
    const locationIds = [...new Set(owned.map(([, order]) => order.locationId as string))];
    const locations = new Map(await Promise.all(locationIds.map(async id => [id, (await tx.get(db.collection('locations').doc(id))).data()] as const)));
    const orders: PortalOrder[] = [];
    for (const [id, order] of owned) {
      const location = locations.get(order.locationId), date = asDate(order.paidAt) || asDate(order.createdAt);
      const grossOre = typeof order.totalAmount === 'number' ? Math.round(order.totalAmount * 100) : NaN;
      const refundOre = order.refundedAmountOre ?? 0;
      const managed=managedDeliveryBindingSchema.safeParse(order.managedDelivery).success&&order.deliveryType==='Delivery';
      const visibleFulfillment=SETTLED.has(order.status)||managed&&['Pending','Error','Canceled'].includes(order.status);
      if (!location || location.brandId !== brand.brandId || location.deletedAt || location.status === 'deleted'
        || !(order.paymentStatus === 'Paid'||managed&&order.paymentStatus==='Refunded') || !visibleFulfillment || !date
        || typeof order.totalAmount !== 'number' || order.totalAmount < 0 || !Number.isSafeInteger(grossOre) || grossOre < 0 || !Number.isSafeInteger(refundOre) || refundOre < 0 || refundOre > grossOre) continue;
      const managedDeliveryTracking = await loadAuthorizedDeliveryTracking(tx,id,order);
      orders.push({ ...(managedDeliveryTracking ? {managedDeliveryTracking} : {}), id, orderedAt: date.getTime(), locationName: typeof location.name === 'string' ? location.name.slice(0, 160) : 'Lokation',
        status: order.status, totalAmount: grossOre / 100, refundedAmount: refundOre / 100, netAmount: (grossOre - refundOre) / 100 });
    }
    return orders.sort((a, b) => b.orderedAt - a.orderedAt || a.id.localeCompare(b.id)).slice(0, 100);
  });
}
