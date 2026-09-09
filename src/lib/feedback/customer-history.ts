import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { assertFeedbackBrand, FeedbackAccessError, requireFeedbackAccess } from './access';
import { feedbackMetrics, feedbackTime } from './metrics';

// Customer administration predates feedback sessions. Omit this protected section
// when its reader has no feedback grant; never fall back to client Firestore.
export async function customerFeedbackHistory(brandId: string, customerId: string) {
  try { assertFeedbackBrand(await requireFeedbackAccess(), brandId); }
  catch (error) { if (error instanceof FeedbackAccessError) return null; throw error; }
  const docs = (await getAdminDb().collection('feedback').where('brandId', '==', brandId).where('customerId', '==', customerId).get()).docs;
  return docs.map(doc => { const data = doc.data(); return {
    id: doc.id, rating: feedbackMetrics(data).rating, receivedAt: feedbackTime(data.receivedAt)?.toISOString() ?? null,
    comment: typeof data.comment === 'string' ? data.comment : '', orderId: typeof data.orderId === 'string' ? data.orderId : null,
  }; });
}
