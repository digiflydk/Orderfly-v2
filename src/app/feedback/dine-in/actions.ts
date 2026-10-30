'use server';

import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { readDineInToken, dineInQuestionHash, dineInRateKey, selectDineInQuestions } from '@/lib/feedback/dine-in';
import { validateFeedbackResponses } from '@/lib/feedback/response-validation';
import { feedbackMetrics } from '@/lib/feedback/metrics';
import { eligibleExternalReviewLinks } from '@/lib/feedback/external-review-settings';
import { createExternalReviewReceipt, setExternalReviewReceipt } from '@/lib/feedback/external-review-receipt';
import { feedbackThankYouHref } from '@/lib/feedback/presentation';
import type { ExperienceFeedbackQuestionsVersion } from '@/lib/feedback/source-types';

export async function submitDineInFeedbackAction(_previous: unknown, formData: FormData) {
  await setExternalReviewReceipt();
  const token = readDineInToken(formData.get('invitationToken'));
  if (!token) return { error: true, message: formData.get('language') === 'en' ? 'The form has expired. Open the QR link again.' : 'Spørgeskemaet er udløbet. Åbn QR-linket igen.' };
  // All scope comes from the signed server context. Extra client identity cannot impersonate a customer.
  if (formData.get('sourceType') !== 'dine_in' || formData.get('sourceId') !== token.nonce ||
      formData.get('customerId') !== '' || formData.get('questionVersionId') !== token.questionVersionId || formData.get('language') !== token.language) {
    return { error: true, message: token.language === 'en' ? 'The feedback source could not be verified.' : 'Feedbackkilden kunne ikke bekræftes.' };
  }
  try {
    const raw = formData.get('responses');
    if (typeof raw !== 'string' || raw.length > 50000) return { error: true, message: token.language === 'en' ? 'Invalid response.' : 'Ugyldigt svar.' };
    const answers = JSON.parse(raw);
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return { error: true, message: token.language === 'en' ? 'Invalid response.' : 'Ugyldigt svar.' };
    const db = getAdminDb(), now = Date.now();
    const feedbackId = createHash('sha256').update(JSON.stringify([token.brandId, 'dine_in', token.nonce])).digest('hex');
    const feedbackRef = db.collection('feedback').doc(feedbackId);
    const requestHeaders = await headers();
    const candidateAddress = (requestHeaders.get('x-forwarded-for') || requestHeaders.get('x-real-ip') || '').split(',')[0].trim();
    const address = isIP(candidateAddress) ? candidateAddress : 'unknown';
    const limits = [
      { ref: db.collection('feedbackDineInLimits').doc(dineInRateKey(token.locationId, address)), maximum: 30, duration: 60000 },
      { ref: db.collection('feedbackDineInLimits').doc(dineInRateKey(token.locationId)), maximum: 300, duration: 3600000 },
    ];
    const receipt = createExternalReviewReceipt();
    const offerReview = await db.runTransaction(async tx => {
      const existing = await tx.get(feedbackRef);
      if (existing.exists) return false;
      const [brand, location, settings, versions] = await Promise.all([
        tx.get(db.collection('brands').doc(token.brandId)), tx.get(db.collection('locations').doc(token.locationId)),
        tx.get(db.collection('feedbackSettings').doc(token.brandId)), tx.get(db.collection('feedbackQuestionsVersion')),
      ]);
      await tx.get(db.collection('feedbackConfiguration').doc('versionLock'));
      if (!brand.exists || brand.data()?.status !== 'active' || brand.data()?.slug !== token.brandSlug ||
          !location.exists || location.data()?.brandId !== token.brandId || location.data()?.isActive === false || location.data()?.slug !== token.locationSlug) throw Error('Inactive source');
      const questionVersion = selectDineInQuestions(versions.docs.map(d => ({ ...d.data(), id: d.id }) as ExperienceFeedbackQuestionsVersion), token.brandId, token.language, settings.data()?.questionVersionId);
      if (!questionVersion || questionVersion.id !== token.questionVersionId || dineInQuestionHash(questionVersion) !== token.questionHash) throw Error('Form changed');
      const validated = validateFeedbackResponses(questionVersion.questions, answers);
      if (!validated.ok) throw Error('Invalid responses');
      const limitSnapshots = await Promise.all(limits.map(limit => tx.get(limit.ref)));
      const counts = limits.map((limit, i) => {
        const saved = limitSnapshots[i].data();
        const resetAt = typeof saved?.resetAt === 'number' && saved.resetAt > now ? saved.resetAt : now + limit.duration;
        const count = saved && saved.resetAt > now && Number.isInteger(saved.count) ? saved.count : 0;
        if (count >= limit.maximum) throw Error('Rate limit');
        return { count: count + 1, resetAt };
      });
      const metrics = feedbackMetrics({ responses: validated.responses });
      const links = eligibleExternalReviewLinks(settings.data(), metrics.rating);
      const comment = Object.values(validated.responses).find(r => r.type === 'text')?.answer;
      tx.create(feedbackRef, {
        id: feedbackId, sourceType: 'dine_in', sourceId: token.nonce, customerId: '',
        brandId: token.brandId, locationId: token.locationId, questionVersionId: token.questionVersionId,
        language: token.language, responses: validated.responses, rating: metrics.rating ?? 0,
        ...(metrics.nps !== null ? { npsScore: metrics.nps } : {}), ...(typeof comment === 'string' ? { comment } : {}),
        receivedAt: getAdminFieldValue().serverTimestamp(), showPublicly: false, maskCustomerName: true,
        autoResponseSent: false, answeredVia: 'qr', tags: [],
        ...(links ? { externalReviewReceipt: { hash: receipt.hash, expiresAt: receipt.expiresAt } } : {}),
      });
      limits.forEach((limit, i) => tx.set(limit.ref, counts[i]));
      return Boolean(links);
    });
    if (offerReview) await setExternalReviewReceipt(feedbackId, receipt.token);
    try { revalidatePath('/superadmin/feedback'); } catch { /* Saved feedback remains successful. */ }
  } catch {
    return { error: true, message: token.language === 'en' ? 'Unable to save feedback. Your answers have been kept. Try again or reopen the QR link.' : 'Feedback kunne ikke gemmes. Dine svar er bevaret. Prøv igen eller åbn QR-linket igen.' };
  }
  redirect(feedbackThankYouHref(token.brandId, token.language));
}
