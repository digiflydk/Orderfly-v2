import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase-admin';
import { eligibleExternalReviewLinks } from './external-review-settings';

const COOKIE = 'feedback_review_receipt';
const MAX_AGE_SECONDS = 600;

export function createExternalReviewReceipt(now = Date.now()) {
  const token = randomBytes(32).toString('hex');
  return { token, hash: createHash('sha256').update(token).digest('hex'), expiresAt: now + MAX_AGE_SECONDS * 1000 };
}

// A failed cookie write must never turn successfully saved feedback into an error.
export async function setExternalReviewReceipt(feedbackId?: string, token?: string) {
  try {
    (await cookies()).set(COOKIE, feedbackId && token ? `${feedbackId}.${token}` : '', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
      path: '/feedback', maxAge: feedbackId && token ? MAX_AGE_SECONDS : 0,
    });
  } catch { /* The ordinary thank-you page remains available without an invitation. */ }
}

export async function readExternalReviewReceipt(brandId: string, now = Date.now()) {
  if (!brandId) return null;
  try {
    const value = (await cookies()).get(COOKIE)?.value;
    if (!value || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return null;
    const [feedbackId, token] = value.split('.');
    const db = getAdminDb();
    const feedback = (await db.collection('feedback').doc(feedbackId).get()).data();
    const receipt = feedback?.externalReviewReceipt;
    if (!feedback || feedback.brandId !== brandId || !receipt || typeof receipt.expiresAt !== 'number' || !Number.isFinite(receipt.expiresAt) || receipt.expiresAt <= now || receipt.expiresAt > now + MAX_AGE_SECONDS * 1000 || typeof receipt.hash !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.hash)) return null;
    const hash = createHash('sha256').update(token).digest();
    if (!timingSafeEqual(Buffer.from(receipt.hash, 'hex'), hash)) return null;
    const settings = (await db.collection('feedbackSettings').doc(feedback.brandId).get()).data();
    return eligibleExternalReviewLinks(settings, feedback.rating);
  } catch { return null; }
}
