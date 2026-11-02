import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { dullyPurchaseCounts, dullyPurchaseStats } from './dully-customer-contract';

export type DullyPurchaseView = {
  id: string; orderNumber: string; experienceType: 'pickup' | 'delivery'; orderedAt: string; completedAt: string | null;
  status: string; paymentStatus: string; orderTotal: number; refundedAmount: number; counted: boolean;
  orderLines: Array<{ name: string; quantity: number; total: number }>;
};
export type DullyPurchaseSummary = ReturnType<typeof dullyPurchaseStats> & { daysSinceLast: number | null; averageDaysBetween: number | null };

const DAY = 24 * 3600000;
/**
 * Dully purchases for one already-authorized customer record. The caller must have authorized the
 * customer (getCustomerDetails); the brand filter keeps a guessed ID from crossing tenants.
 */
export async function getDullyPurchases(customerId: string, brandId: string, now = Date.now()) {
  const docs = await getAdminDb().collection('dullyCustomerPurchases').where('customerId', '==', customerId).get();
  const rows = docs.docs.map(d => d.data()).filter(p => p.brandId === brandId && typeof p.orderedAt === 'string');
  // Only primitive fields cross the Server Component boundary.
  const purchases: DullyPurchaseView[] = rows.map(p => ({
    id: String(p.id), orderNumber: String(p.orderNumber || ''), experienceType: (p.experienceType === 'delivery' ? 'delivery' : 'pickup') as 'pickup' | 'delivery',
    orderedAt: p.orderedAt, completedAt: typeof p.completedAt === 'string' ? p.completedAt : null, status: String(p.status || ''),
    paymentStatus: String(p.paymentStatus || ''), orderTotal: Number(p.orderTotal) || 0, refundedAmount: Number(p.refundedAmount) || 0,
    counted: dullyPurchaseCounts(p as any),
    orderLines: Array.isArray(p.orderLines) ? p.orderLines.slice(0, 100).map((l: any) => ({ name: String(l.name || ''), quantity: Number(l.quantity) || 1, total: Number(l.total) || 0 })) : [],
  })).sort((a, b) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt));
  const stats = dullyPurchaseStats(purchases as any);
  const counted = purchases.filter(p => p.counted).map(p => Date.parse(p.orderedAt)).sort((a, b) => a - b);
  const summary: DullyPurchaseSummary = {
    ...stats,
    daysSinceLast: counted.length ? Math.floor((now - counted[counted.length - 1]) / DAY) : null,
    averageDaysBetween: counted.length > 1 ? Math.round((counted[counted.length - 1] - counted[0]) / DAY / (counted.length - 1)) : null,
  };
  return { purchases, summary };
}
