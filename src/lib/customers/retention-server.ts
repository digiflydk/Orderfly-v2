import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { listScopedDocuments } from '@/lib/access/scoped-data';
import { asDate } from '@/lib/loyalty/model';
import { paidSaleAmount } from '@/lib/paid-order';
import { dullyPurchaseCounts } from './dully-customer-contract';
import { retentionReport, type RetentionPurchase } from './retention';

/** Brands whose full customer base this session may analyse (company-wide customer grants only). */
export async function retentionBrandIds() {
  const docs = await listScopedDocuments('customers', 'orderfly.customers:view', 'company');
  return { docs, brandIds: [...new Set(docs.map(d => String(d.data().brandId)))].sort() };
}

// Orderfly paid orders and Dully purchases, joined on the brand-scoped customer record. Dully stays a separate
// source: it only feeds this analysis, never orders, revenue or loyalty.
export async function retentionForBrand(brandId: string, now = Date.now()) {
  const { docs, brandIds } = await retentionBrandIds();
  if (!brandIds.includes(brandId)) return null;
  const customerIds = new Set(docs.filter(d => d.data().brandId === brandId).map(d => d.id));
  const db = getAdminDb();
  const [orders, dully] = await Promise.all([
    db.collection('orders').where('brandId', '==', brandId).get(),
    db.collection('dullyCustomerPurchases').where('brandId', '==', brandId).get(),
  ]);
  const purchases: RetentionPurchase[] = [];
  for (const doc of orders.docs) {
    const o = doc.data(), customerId = o.customerDetails?.id, amount = paidSaleAmount(o), at = asDate(o.paidAt || o.createdAt);
    if (typeof customerId === 'string' && customerIds.has(customerId) && amount > 0 && at) purchases.push({ customerId, at: at.getTime(), amount, source: 'orderfly' });
  }
  for (const doc of dully.docs) {
    const p = doc.data();
    if (typeof p.customerId === 'string' && customerIds.has(p.customerId) && typeof p.orderedAt === 'string' && dullyPurchaseCounts(p as any))
      purchases.push({ customerId: p.customerId, at: Date.parse(p.orderedAt), amount: Number(p.orderTotal) - (Number(p.refundedAmount) || 0), source: 'dully' });
  }
  return { customers: customerIds.size, report: retentionReport(purchases, now) };
}
