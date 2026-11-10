import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { assertFeedbackBrand, FeedbackAccessError, requireFeedbackAccess } from './access';
import { feedbackMetrics, feedbackTime } from './metrics';

// Customer administration predates feedback sessions. Omit this protected section
// when its reader has no feedback grant; never fall back to client Firestore.
export async function customerFeedbackHistory(brandId: string, customerId: string) {
  try { assertFeedbackBrand(await requireFeedbackAccess(), brandId); }
  catch (error) { if (error instanceof FeedbackAccessError) return null; throw error; }
  const db = getAdminDb();
  const docs = [...(await db.collection('feedback').where('brandId', '==', brandId).where('customerId', '==', customerId).get()).docs];
  // Dully feedback is keyed by its Dully source, not the customer record (#901): link it by the record's e-mail addresses.
  const customer = (await db.collection('customers').doc(customerId).get()).data();
  if (customer?.brandId === brandId) {
    const emails = [...new Set([customer.email, customer.normalizedEmail, ...(Array.isArray(customer.emailAliases) ? customer.emailAliases : [])]
      .filter((value): value is string => typeof value === 'string' && value.includes('@')).map(value => value.trim().toLowerCase()))].slice(0, 10);
    const sources = emails.length ? (await db.collection('dullyFeedbackSources').where('brandId', '==', brandId).where('email', 'in', emails).get()).docs.filter(d => d.data().isTest !== true).map(d => d.id) : [];
    for (let i = 0; i < sources.length; i += 30) {
      const extra = (await db.collection('feedback').where('brandId', '==', brandId).where('customerId', 'in', sources.slice(i, i + 30)).get()).docs;
      for (const doc of extra) if (!docs.some(d => d.id === doc.id)) docs.push(doc);
    }
  }
  return docs.map(doc => { const data = doc.data(); return {
    id: doc.id, rating: feedbackMetrics(data).rating, receivedAt: feedbackTime(data.receivedAt)?.toISOString() ?? null,
    comment: typeof data.comment === 'string' ? data.comment : '', orderId: typeof data.orderId === 'string' ? data.orderId : null,
  }; });
}
