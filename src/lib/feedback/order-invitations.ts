import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
export function feedbackSourceKey(brandId: string, sourceType: string, sourceId: string) {
  return createHash('sha256').update(JSON.stringify([brandId, sourceType, sourceId])).digest('hex');
}
const signature = (value: string) => {
  const secret = process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET || '';
  if (secret.length < 32) throw new Error('Feedback invitation signing is not configured.');
  return createHmac('sha256', secret).update('orderfly-feedback-v1:' + value).digest('base64url');
};
export function signOrderFeedbackInvitation(id: string, expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ v: 1, id, exp: expiresAt })).toString('base64url');
  return payload + '.' + signature(payload);
}
export async function resolveOrderFeedbackInvitation(token: string) {
  try {
    if (token.length > 4096) return null;
    const parts = token.split('.'); if (parts.length !== 2) return null;
    const [encoded, supplied] = parts, expected = Buffer.from(signature(encoded)), actual = Buffer.from(supplied);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (payload.v !== 1 || !/^[a-f0-9]{64}$/.test(payload.id) || typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    const doc = await getAdminDb().collection('feedbackInvitations').doc(payload.id).get(), data = doc.data();
    if (!data || data.sourceType !== 'commerce_order' || !['active', 'submitted'].includes(data.status) || data.expiresAt !== payload.exp) return null;
    return { id: doc.id, brandId: String(data.brandId), locationId: String(data.locationId), customerId: String(data.customerId), sourceId: String(data.sourceId), language: String(data.language || 'da'), status: data.status as 'active' | 'submitted' };
  } catch { return null; }
}
export function completedFeedbackOrder(order: Record<string, any>) {
  return ['Completed', 'Delivered'].includes(order.status) && order.paymentStatus === 'Paid' &&
    !(typeof order.refundedAmountOre === 'number' && order.refundedAmountOre > 0) &&
    !(typeof order.refundedAmount === 'number' && order.refundedAmount > 0) && !order.refundedAt;
}
