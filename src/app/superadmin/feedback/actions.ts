'use server';
import 'server-only';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { upsellClientData } from '@/lib/upsell-serialization';
import { FeedbackQuestionsVersionSchema } from '@/lib/schemas/feedback';
import { readQuestionVersions, readActiveQuestions } from '@/lib/feedback/question-store';
import type { Feedback, FeedbackQuestionsVersion } from '@/types';
import type { FeedbackExperienceType } from '@/lib/feedback/source-types';

type ActionResult = { ok: true; id: string } | { ok: false; error: string };
function permit(permission: string) {
  if (!hasPermission(permission)) throw new Error('Access denied.');
}

export async function createOrUpdateQuestionVersion(formData: FormData): Promise<ActionResult> {
  try {
    permit('settings:edit');
    const parsed = FeedbackQuestionsVersionSchema.safeParse({
      id: formData.get('id') || undefined,
      versionLabel: formData.get('versionLabel'),
      isActive: ['on', 'true'].includes(String(formData.get('isActive'))),
      language: formData.get('language') || 'da',
      orderTypes: [...new Set(formData.getAll('orderTypes'))],
      questions: JSON.parse(String(formData.get('questions') || '[]')),
    });
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map(i => i.message).join(' ') };
    const { id, ...data } = parsed.data;
    const db = getAdminDb();
    const col = db.collection('feedbackQuestionsVersion');
    const ref = id ? col.doc(id) : col.doc();
    // Serialize activation changes so two admins cannot activate conflicting versions.
    const lock = db.collection('feedbackConfiguration').doc('versionLock');
    await db.runTransaction(async tx => {
      await tx.get(lock);
      const existing = await tx.get(ref);
      if (id && !existing.exists) throw new Error('Question version no longer exists.');
      const active = await tx.get(col.where('isActive', '==', true));
      const conflict = active.docs.some(doc => doc.id !== ref.id && doc.data().language === data.language &&
        (doc.data().orderTypes || []).some((type: string) => data.orderTypes.includes(type as FeedbackExperienceType)));
      if (data.isActive && conflict) throw new Error('Deactivate the existing version for this language and experience type first.');
      const timestamp = getAdminFieldValue().serverTimestamp();
      const payload = { ...JSON.parse(JSON.stringify(data)), id: ref.id, updatedAt: timestamp };
      if (id) tx.update(ref, payload);
      else tx.create(ref, { ...payload, createdAt: timestamp });
      tx.set(lock, { updatedAt: timestamp });
    });
    try {
      revalidatePath('/superadmin/feedback/questions');
      revalidatePath(`/superadmin/feedback/questions/edit/${ref.id}`);
    } catch (error) { console.error('Feedback question cache refresh failed', error); }
    return { ok: true, id: ref.id };
  } catch (error) {
    return { ok: false, error: error instanceof SyntaxError ? 'Invalid questions JSON.' : error instanceof Error ? error.message : 'Could not save question version.' };
  }
}

export async function getFeedbackEntries(): Promise<Feedback[]> {
  permit('orders:view');
  const snapshot = await getAdminDb().collection('feedback').get();
  const entries = snapshot.docs.map(doc => upsellClientData({ ...doc.data(), id: doc.id }) as Feedback);
  const date = (value: unknown) => { const time = new Date(value as string).getTime(); return Number.isFinite(time) ? time : 0; };
  return entries.sort((a, b) => date(b.receivedAt) - date(a.receivedAt));
}

export async function getFeedbackById(id: string): Promise<Feedback | null> {
  permit('orders:view');
  const doc = await getAdminDb().collection('feedback').doc(id).get();
  return doc.exists ? upsellClientData({ ...doc.data(), id: doc.id }) as Feedback : null;
}

const moderationSchema = z.object({
  showPublicly: z.boolean().optional(),
  maskCustomerName: z.boolean().optional(),
  internalNote: z.string().max(10000).optional(),
}).strict().refine(value => Object.values(value).some(v => v !== undefined), 'No changes provided.');

export async function updateFeedback(feedbackId: string, data: Partial<Pick<Feedback, 'showPublicly' | 'maskCustomerName' | 'internalNote'>>) {
  try {
    permit('orders:edit');
    const parsed = moderationSchema.parse(data);
    await getAdminDb().collection('feedback').doc(feedbackId).update(parsed);
    revalidatePath('/superadmin/feedback');
    revalidatePath(`/superadmin/feedback/${feedbackId}`);
    return { message: 'Feedback updated successfully.', error: false };
  } catch {
    return { message: 'Could not update feedback. Check your changes and try again.', error: true };
  }
}

export async function deleteFeedback(id: string) {
  try {
    permit('orders:edit');
    await getAdminDb().collection('feedback').doc(id).delete();
    revalidatePath('/superadmin/feedback');
    return { message: 'Feedback deleted successfully.', error: false };
  } catch {
    return { message: 'Could not delete feedback. Please try again.', error: true };
  }
}

export async function sendFeedbackRequestEmail(_orderId: string) {
  // Never claim a simulated email was sent or log a customer's private feedback link.
  return { error: 'Feedback emails are not configured. No email was sent.' };
}

export async function getActiveFeedbackQuestionsForExperience(type: FeedbackExperienceType, language = 'da') {
  return readActiveQuestions(type, language);
}
export async function getActiveFeedbackQuestionsForOrder(deliveryType: 'Delivery' | 'Pickup') {
  return await readActiveQuestions(deliveryType.toLowerCase() as 'pickup' | 'delivery') as FeedbackQuestionsVersion | null;
}
export async function getFeedbackQuestionVersions(): Promise<FeedbackQuestionsVersion[]> {
  permit('settings:view');
  return await readQuestionVersions() as FeedbackQuestionsVersion[];
}
