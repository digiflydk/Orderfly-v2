import 'server-only';
import { z } from 'zod';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { requireFeedbackAccess, assertFeedbackBrand } from './access';
import { feedbackMetrics, feedbackTime } from './metrics';
import { publicReviewText, reviewDisplayName } from './public-reviews';

export const moderationSchema = z.object({
  showPublicly: z.boolean().optional(),
  maskCustomerName: z.boolean().optional(),
  internalNote: z.string().max(10000).optional(),
  publicComment: z.string().max(2000).optional(),
}).strict().refine(v => Object.values(v).some(value => value !== undefined), 'No changes provided.');
export type FeedbackModeration = z.infer<typeof moderationSchema>;

export async function moderateFeedback(id: string, changes: unknown, remove = false) {
  const access = await requireFeedbackAccess('feedback:edit');
  if (!/^[\w-]{1,160}$/.test(id)) throw new Error('Ugyldig feedback.');
  const parsed = remove ? {} : moderationSchema.parse(changes);
  const db = getAdminDb(), ref = db.collection('feedback').doc(id);
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref), existing = snapshot.data();
    if (!existing) throw new Error('Feedback findes ikke længere.');
    assertFeedbackBrand(access, existing.brandId);
    const publicRef = db.collection('publicFeedbackReviews').doc(id);
    const next = { ...existing, ...parsed };
    // Older showPublicly flags require a fresh, authenticated approval.
    const approved = !remove && next.showPublicly === true && (parsed.showPublicly === true || existing.publication?.approvedBy);
    let projection: Record<string, unknown> | null = null;
    const now = getAdminFieldValue().serverTimestamp();
    if (approved) {
      if (typeof existing.locationId !== 'string' || !/^[\w-]{1,160}$/.test(existing.locationId)) throw new Error('Anmeldelsen mangler en gyldig lokation.');
      const location = await tx.get(db.collection('locations').doc(existing.locationId));
      if (location.data()?.brandId !== existing.brandId) throw new Error('Anmeldelsens lokation tilhører ikke brandet.');
      const masked = parsed.maskCustomerName ?? (existing.publication ? existing.maskCustomerName : true);
      let name: unknown;
      if (!masked && typeof existing.customerId === 'string' && /^[\w-]{1,160}$/.test(existing.customerId)) {
        const customer = await tx.get(db.collection('customers').doc(existing.customerId));
        if (customer.data()?.brandId === existing.brandId) name = customer.data()?.fullName;
      }
      const comment = publicReviewText(parsed.publicComment ?? existing.publicComment ?? existing.comment);
      const rating = feedbackMetrics(existing).rating;
      if (!comment && rating === null) throw new Error('Anmeldelsen skal indeholde tekst eller en gyldig rating.');
      next.maskCustomerName = masked;
      next.publicComment = comment;
      projection = { brandId: existing.brandId, locationId: existing.locationId, displayName: reviewDisplayName(name, masked), comment, rating, receivedAt: feedbackTime(existing.receivedAt), approvedAt: now };
    }
    // Moderation, public projection and its audit record commit together.
    if (remove) tx.delete(ref);
    else tx.update(ref, {
      ...parsed,
      ...(approved ? { maskCustomerName: next.maskCustomerName, publicComment: next.publicComment } : {}),
      ...(parsed.showPublicly !== undefined || approved ? { publication: approved ? { approvedBy: access.uid, approvedAt: now } : null } : {}),
      updatedAt: now,
    });
    if (projection) tx.set(publicRef, projection);
    else tx.delete(publicRef);
    tx.create(db.collection('feedbackModerationAudit').doc(), { feedbackId: id, brandId: existing.brandId, actorUid: access.uid, action: remove ? 'deleted' : approved ? 'approved' : 'updated', fields: Object.keys(parsed), at: now });
  });
}
