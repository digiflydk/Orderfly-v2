'use server';
import 'server-only';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { requireFeedbackAccess, requireQuestionAccess, assertFeedbackBrand } from '@/lib/feedback/access';
import { moderateFeedback, type FeedbackModeration } from '@/lib/feedback/moderation';
import { queueOrderFeedback } from '@/lib/feedback/mail-queue';
import { upsellClientData } from '@/lib/upsell-serialization';
import { FeedbackQuestionsVersionSchema } from '@/lib/schemas/feedback';
import { readQuestionVersions, readActiveQuestions } from '@/lib/feedback/question-store';
import type { Feedback, FeedbackQuestionsVersion } from '@/types';
import type { FeedbackExperienceType } from '@/lib/feedback/source-types';

type ActionResult = { ok: true; id: string } | { ok: false; error: string };

export async function createOrUpdateQuestionVersion(formData: FormData): Promise<ActionResult> {
  try {
    await requireQuestionAccess(true);
    const scope = formData.get('scope') === 'brand' ? 'brand' : 'default';
    const parsed = FeedbackQuestionsVersionSchema.safeParse({
      id: formData.get('id') || undefined,
      versionLabel: formData.get('versionLabel'),
      isActive: ['on', 'true'].includes(String(formData.get('isActive'))),
      scope,
      brandId: scope === 'brand' ? formData.get('brandId') : null,
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
      const [existing, active, brand] = await Promise.all([
        tx.get(ref),
        tx.get(col.where('isActive', '==', true)),
        data.scope === 'brand' && data.brandId ? tx.get(db.collection('brands').doc(data.brandId)) : Promise.resolve(null),
        tx.get(lock),
      ]);
      if (id && !existing.exists) throw new Error('Question version no longer exists.');
      if (data.scope === 'brand' && !brand?.exists) throw new Error('The selected brand no longer exists.');
      const conflict = active.docs.some(doc => {
        const current = doc.data();
        const currentScope = current.scope === 'brand' ? 'brand' : 'default';
        const sameScope = currentScope === data.scope && (data.scope === 'default' || current.brandId === data.brandId);
        return doc.id !== ref.id && sameScope && current.language === data.language &&
          (current.orderTypes || []).some((type: string) => data.orderTypes.includes(type as FeedbackExperienceType));
      });
      if (data.isActive && conflict) throw new Error('Deactivate the existing version for this language and experience type first.');
      const timestamp = getAdminFieldValue().serverTimestamp();
      const payload = { ...JSON.parse(JSON.stringify(data)), brandId: data.scope === 'brand' ? data.brandId : null, id: ref.id, updatedAt: timestamp };
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
  const access = await requireFeedbackAccess();
  const collection = getAdminDb().collection('feedback');
  const docs = access.brandIds === null ? (await collection.get()).docs
    : (await Promise.all(access.brandIds.map(id => collection.where('brandId', '==', id).get()))).flatMap(s => s.docs);
  const entries = docs.map(doc => upsellClientData({ ...doc.data(), id: doc.id }) as Feedback);
  const date = (value: unknown) => { const time = new Date(value as string).getTime(); return Number.isFinite(time) ? time : 0; };
  return entries.sort((a, b) => date(b.receivedAt) - date(a.receivedAt));
}

export async function getFeedbackById(id: string): Promise<Feedback | null> {
  const access = await requireFeedbackAccess();
  if (!/^[\w-]{1,160}$/.test(id)) return null;
  const doc = await getAdminDb().collection('feedback').doc(id).get();
  if (doc.exists) assertFeedbackBrand(access, doc.data()?.brandId);
  return doc.exists ? upsellClientData({ ...doc.data(), id: doc.id }) as Feedback : null;
}

export async function updateFeedback(feedbackId: string, data: FeedbackModeration) {
  try {
    await moderateFeedback(feedbackId, data);
    try { revalidatePath('/superadmin/feedback'); revalidatePath(`/superadmin/feedback/${feedbackId}`); } catch {}
    return { message: 'Feedback updated successfully.', error: false, feedback: await getFeedbackById(feedbackId).catch(() => null) };
  } catch {
    return { message: 'Could not update feedback. Check your changes and try again.', error: true };
  }
}

export async function deleteFeedback(id: string) {
  try {
    await moderateFeedback(id, {}, true);
    try { revalidatePath('/superadmin/feedback'); } catch {}
    return { message: 'Feedback deleted successfully.', error: false };
  } catch {
    return { message: 'Could not delete feedback. Please try again.', error: true };
  }
}

export async function sendFeedbackRequestEmail(orderId: string) {
  try {
    const access = await requireFeedbackAccess('feedback:edit');
    if (!/^[\w-]{1,160}$/.test(orderId)) throw new Error('Ugyldig ordre.');
    const order = (await getAdminDb().collection('orders').doc(orderId).get()).data();
    assertFeedbackBrand(access, order?.brandId);
    const jobId = await queueOrderFeedback(orderId);
    if (!jobId) return { error: 'Feedbackmail er deaktiveret for dette brand.' };
    return { ok: true, message: 'Feedbackanmodningen er registreret i afsendelseskøen. Se status under Feedbackindstillinger.' };
  } catch { return { error: 'Kunne ikke lægge feedbackmail i kø. Kontrollér login, mailopsætning og at ordren er gennemført og betalt.' }; }
}

export async function getActiveFeedbackQuestionsForExperience(type: FeedbackExperienceType, language = 'da') {
  return readActiveQuestions(type, language);
}
export async function getActiveFeedbackQuestionsForOrder(deliveryType: 'Delivery' | 'Pickup') {
  return await readActiveQuestions(deliveryType.toLowerCase() as 'pickup' | 'delivery') as FeedbackQuestionsVersion | null;
}
export async function getFeedbackQuestionVersions(): Promise<FeedbackQuestionsVersion[]> {
  await requireQuestionAccess();
  return await readQuestionVersions() as FeedbackQuestionsVersion[];
}
