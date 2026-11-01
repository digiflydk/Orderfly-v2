import { z } from 'zod';
import { createHash } from 'node:crypto';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
export const DULLY_TEST_EMAIL = 'ok@esmeraldapizza.dk';
export const DULLY_START = Date.parse('2026-10-31T00:00:00+01:00');
export const DULLY_NEVER = Number.MAX_SAFE_INTEGER;
const externalId = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
export const dullyScopeSchema = z.object({ brandId: z.string().regex(/^[\w-]{1,160}$/), locationId: z.string().regex(/^[\w-]{1,160}$/) });
export const dullyImportRowSchema = z.object({
  externalOrderId: externalId, orderNumber: z.string().trim().min(1).max(80), externalRestaurantId: externalId,
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  experienceType: z.enum(['pickup', 'delivery']), orderedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  status: z.enum(['completed', 'pending', 'cancelled']), paymentStatus: z.enum(['paid', 'unpaid', 'refunded']),
  // Optional follow-up details shown only to feedback admins; never part of the order identity.
  customerName: z.string().trim().min(1).max(160).optional(), customerPhone: z.string().trim().min(4).max(40).optional(),
  orderTotal: z.number().finite().min(0).max(1000000).optional(),
  orderLines: z.array(z.object({ name: z.string().trim().min(1).max(160), quantity: z.number().int().min(1).max(999), total: z.number().finite().min(0).max(1000000) }).strict()).max(100).optional(),
}).strict().refine(r => r.status !== 'completed' || (r.completedAt !== null && Date.parse(r.completedAt) >= Date.parse(r.orderedAt)), 'Gennemførte ordrer skal have et gyldigt afslutningstidspunkt.');
export type DullyImportRow = z.infer<typeof dullyImportRowSchema>;
export const DULLY_DETAIL_FIELDS = ['customerName', 'customerPhone', 'orderTotal', 'orderLines'] as const;
export function dullyDetails(row: DullyImportRow) {
  return Object.fromEntries(DULLY_DETAIL_FIELDS.filter(key => row[key] !== undefined).map(key => [key, row[key]]));
}
export const dullyConfigureSchema = dullyScopeSchema.extend({ accountId: externalId, restaurantId: externalId }).strict();
export function dullyHash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function dullyScopeId(brandId: string, locationId: string) { return dullyHash(['dully', brandId, locationId]); }
// Location is deliberately not in identity: one external order cannot be duplicated by remapping a location.
export function dullySourceId(brandId: string, accountId: string, externalOrderId: string) { return dullyHash(['dully', brandId, accountId, externalOrderId]); }
export function dullyEligible(row: Record<string, any>, now = Date.now()) {
  return row.status === 'completed' && row.paymentStatus === 'paid' && typeof row.orderedAt === 'string' &&
    Date.parse(row.orderedAt) >= DULLY_START && typeof row.completedAt === 'string' &&
    Number.isFinite(Date.parse(row.completedAt)) && Date.parse(row.completedAt) >= Date.parse(row.orderedAt) && Date.parse(row.completedAt) <= now;
}
export function dullyDueAt(completedAt: string) {
  const completed = Date.parse(completedAt);
  const date = formatInTimeZone(completed, 'Europe/Copenhagen', 'yyyy-MM-dd');
  let due = fromZonedTime(date + 'T21:00:00', 'Europe/Copenhagen').getTime();
  if (completed > due) {
    const next = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
    due = fromZonedTime(next + 'T21:00:00', 'Europe/Copenhagen').getTime();
  }
  return due;
}
export function dullySameIdentity(a: Record<string, any>, b: DullyImportRow, locationId: string) {
  return a.locationId === locationId && a.externalOrderId === b.externalOrderId && a.externalRestaurantId === b.externalRestaurantId &&
    a.email === b.email && a.experienceType === b.experienceType && a.orderedAt === b.orderedAt && a.orderNumber === b.orderNumber;
}
