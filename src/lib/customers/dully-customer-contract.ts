import { createHash } from 'node:crypto';
import { z } from 'zod';

// Dully purchases are a separate customer/retention source. They never become Orderfly orders,
// never touch totalOrders/totalSpend/loyalty and never send mail. See docs/customer-dully-purchases.md.
export const DULLY_PURCHASE_RETENTION_MS = 3 * 365 * 24 * 3600000;
const externalId = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
const money = z.number().finite().min(0).max(1000000);
const text = (max: number) => z.string().trim().min(1).max(max);

export const dullyPurchaseRowSchema = z.object({
  externalOrderId: externalId,
  orderNumber: text(80),
  externalRestaurantId: externalId,
  externalCustomerId: externalId.optional(),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()).optional(),
  phone: z.string().trim().min(4).max(40).optional(),
  customerName: text(160).optional(),
  address: z.object({ street: text(200), postalCode: text(20).optional(), city: text(100).optional() }).strict().optional(),
  experienceType: z.enum(['pickup', 'delivery']),
  orderedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  status: z.enum(['completed', 'pending', 'cancelled']),
  paymentStatus: z.enum(['paid', 'unpaid', 'refunded']),
  orderTotal: money,
  refundedAmount: money.optional(),
  orderLines: z.array(z.object({ name: text(160), quantity: z.number().int().min(1).max(999), total: money }).strict()).max(100),
  // Only true when the customer is on Dully's marketing-subscriber list; stored as evidence, never as send permission.
  marketingSubscriber: z.boolean().optional(),
}).strict()
  .refine(r => !!(r.email || r.phone), 'Kunden skal have e-mail eller telefon.')
  .refine(r => r.completedAt === null || Date.parse(r.completedAt) >= Date.parse(r.orderedAt), 'Afslutning ligger før bestilling.');
export type DullyPurchaseRow = z.infer<typeof dullyPurchaseRowSchema>;

function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
// Same identity rule as dullySourceId: location is not part of it, so a remap cannot duplicate a purchase.
export function dullyPurchaseId(brandId: string, accountId: string, externalOrderId: string) {
  return hash(['dully-purchase', brandId, accountId, externalOrderId]);
}
/** A purchase counts for retention when it was completed and paid and not fully refunded. */
export function dullyPurchaseCounts(row: Pick<DullyPurchaseRow, 'status' | 'paymentStatus' | 'orderTotal' | 'refundedAmount'>) {
  return row.status === 'completed' && row.paymentStatus === 'paid' && (row.refundedAmount || 0) < row.orderTotal;
}
export type DullyPurchaseStats = { count: number; amount: number; firstPurchaseAt: string | null; lastPurchaseAt: string | null };
export function dullyPurchaseStats(rows: Array<Pick<DullyPurchaseRow, 'status' | 'paymentStatus' | 'orderTotal' | 'refundedAmount' | 'orderedAt'>>): DullyPurchaseStats {
  const counted = rows.filter(dullyPurchaseCounts).sort((a, b) => Date.parse(a.orderedAt) - Date.parse(b.orderedAt));
  const amount = counted.reduce((sum, r) => sum + r.orderTotal - (r.refundedAmount || 0), 0);
  return { count: counted.length, amount: Math.round(amount * 100) / 100,
    firstPurchaseAt: counted[0]?.orderedAt || null, lastPurchaseAt: counted.at(-1)?.orderedAt || null };
}
