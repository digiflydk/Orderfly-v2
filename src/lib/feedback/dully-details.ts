import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';

export type DullyOrderDetails = {
  customerName: string | null; email: string | null; customerPhone: string | null; orderNumber: string | null;
  experienceType: 'pickup' | 'delivery' | null; orderedAt: string | null; completedAt: string | null;
  orderTotal: number | null; orderLines: { name: string; quantity: number; total: number }[];
};

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;

// Follow-up details for a real (non-test) Dully feedback source in the expected brand. Callers have already checked feedback access.
export async function getDullyOrderDetails(sourceIds: string[], brandId: string | ((sourceId: string) => string)) {
  const ids = [...new Set(sourceIds.filter(id => typeof id === 'string' && /^[\w-]{1,160}$/.test(id)))];
  const docs = await Promise.all(ids.map(id => getAdminDb().collection('dullyFeedbackSources').doc(id).get()));
  const details = new Map<string, DullyOrderDetails>();
  for (const doc of docs) {
    const data = doc.data();
    const expectedBrand = typeof brandId === 'function' ? brandId(doc.id) : brandId;
    if (!doc.exists || !data || data.isTest === true || data.brandId !== expectedBrand) continue;
    details.set(doc.id, {
      customerName: text(data.customerName), email: text(data.email), customerPhone: text(data.customerPhone), orderNumber: text(data.orderNumber),
      experienceType: data.experienceType === 'pickup' || data.experienceType === 'delivery' ? data.experienceType : null,
      orderedAt: text(data.orderedAt), completedAt: text(data.completedAt), orderTotal: amount(data.orderTotal),
      orderLines: Array.isArray(data.orderLines) ? data.orderLines.filter((line: any) => text(line?.name) && amount(line?.quantity) !== null && amount(line?.total) !== null)
        .map((line: any) => ({ name: String(line.name), quantity: Number(line.quantity), total: Number(line.total) })) : [],
    });
  }
  return details;
}
