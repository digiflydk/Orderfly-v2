import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { assertFeedbackBrand, requireFeedbackAccess } from './access';
export async function feedbackMailJobs(brandId: string) {
  assertFeedbackBrand(await requireFeedbackAccess(), brandId);
  const docs = (await getAdminDb().collection('feedbackMailJobs').where('brandId', '==', brandId).orderBy('createdAt', 'desc').limit(50).get()).docs;
  return docs.map(d => { const job = d.data(); return { id: d.id, eventId: typeof job.eventId === 'string' && /^[a-f0-9-]{36}$/.test(job.eventId) ? job.eventId : '', brandId, kind: String(job.kind), state: String(job.state), attempts: Number(job.attempts || 0), updatedAt: Number(job.updatedAt || 0) }; });
}
export async function retryFeedbackMailJob(id: string, providerNotAccepted: boolean) {
  const access = await requireFeedbackAccess('feedback:edit');
  if (!/^[a-f0-9]{64}-(invitation|reminder|thankYou)$/.test(id) || providerNotAccepted !== true) throw new Error('Kontrollér først, at Omnisend ikke har accepteret beskeden.');
  const db = getAdminDb(), ref = db.collection('feedbackMailJobs').doc(id);
  await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || !['failed', 'uncertain'].includes(current.state)) throw new Error('Denne besked kan ikke genstartes.');
    assertFeedbackBrand(access, current.brandId);
    tx.update(ref, { state: 'pending', lease: null, attempts: 0, manualRetries: Number(current.manualRetries || 0) + 1, lastRetriedBy: access.uid, lastRetriedAt: Date.now(), nextAttemptAt: Date.now(), updatedAt: Date.now(), lastError: null });
  });
}
