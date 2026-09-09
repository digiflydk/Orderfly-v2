import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { feedbackMetrics, feedbackTime } from './metrics';

export type PublicReview = { id: string; displayName: string; comment: string; rating: number | null; receivedAt: string | null };
export function publicReviewText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 2000)
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[e-mail fjernet]')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '[link fjernet]')
    .replace(/(?<!\w)\+?\d[\d\s().-]{6,}\d(?!\w)/g, '[nummer fjernet]');
}
export function reviewDisplayName(fullName: unknown, masked: boolean): string {
  if (masked || typeof fullName !== 'string') return 'Anonym kunde';
  const firstName = fullName.trim().split(/\s+/)[0];
  return /^[\p{L}][\p{L}'’-]{0,39}$/u.test(firstName) ? firstName : 'Anonym kunde';
}

/** The public contract is an explicit projection, never a serialized Feedback/Customer. */
export function publicReviewDto(id: string, data: Record<string, unknown>): PublicReview {
  return {
    id,
    displayName: reviewDisplayName(data.displayName, data.displayName === 'Anonym kunde'),
    comment: publicReviewText(data.comment),
    rating: feedbackMetrics({ rating: data.rating }).rating,
    receivedAt: feedbackTime(data.receivedAt)?.toISOString() ?? null,
  };
}

export async function publicReviewsEnabled(brandId: string): Promise<boolean> {
  return (await getAdminDb().collection('feedbackSettings').doc(brandId).get()).data()?.publicReviewsEnabled === true;
}

export async function readPublicReviews(brandId: string, locationId: string, after?: string) {
  const db = getAdminDb();
  const [brand, location, enabled] = await Promise.all([
    db.collection('brands').doc(brandId).get(), db.collection('locations').doc(locationId).get(), publicReviewsEnabled(brandId),
  ]);
  if (!enabled || brand.data()?.status !== 'active' || !location.exists || location.data()?.brandId !== brandId || location.data()?.isActive === false) return null;
  let query = db.collection('publicFeedbackReviews').where('brandId', '==', brandId).where('locationId', '==', locationId).orderBy('__name__');
  if (after && /^[\w-]{1,160}$/.test(after)) query = query.startAfter(after);
  const docs = (await query.limit(21).get()).docs;
  const page = docs.slice(0, 20);
  return {
    reviews: page.map(d => publicReviewDto(d.id, d.data())),
    next: docs.length > 20 ? page[page.length - 1].id : null,
  };
}
