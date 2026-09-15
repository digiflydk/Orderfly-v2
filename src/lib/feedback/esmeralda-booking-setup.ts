import 'server-only';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { FeedbackQuestionsVersionSchema } from '@/lib/schemas/feedback';
import { readActiveQuestionsForBrand } from './question-store';
import { feedbackAutomation } from './mail-config';

export const ESMERALDA_FEEDBACK_BRAND = 'oeypKaMyYcQjIwaa1PtV';
export const ESMERALDA_BOOKING_VERSION = 'esmeralda-booking-da-v1';
export const ESMERALDA_BOOKING_QUESTIONS = FeedbackQuestionsVersionSchema.parse({
  brandId: ESMERALDA_FEEDBACK_BRAND,
  versionLabel: 'Esmeralda · Restaurantbesøg · Dansk v1',
  isActive: true,
  language: 'da',
  orderTypes: ['booking'],
  questions: [
    { questionId: 'rating', label: 'Hvordan var din samlede oplevelse hos Esmeralda?', type: 'stars', isRequired: true },
    { questionId: 'food', label: 'Hvordan var maden?', type: 'stars', isRequired: true },
    { questionId: 'service', label: 'Hvordan var betjeningen?', type: 'stars', isRequired: true },
    { questionId: 'wait', label: 'Hvor tilfreds var du med ventetiden på mad og drikke?', type: 'stars', isRequired: false },
    { questionId: 'atmosphere', label: 'Hvordan var stemningen og omgivelserne?', type: 'stars', isRequired: false },
    { questionId: 'value', label: 'Hvordan vurderer du oplevelsen i forhold til prisen?', type: 'stars', isRequired: false },
    { questionId: 'nps', label: 'Hvor sandsynligt er det, at du vil anbefale Esmeralda til andre?', type: 'nps', isRequired: false },
    { questionId: 'comment', label: 'Hvad fungerede godt, og hvad kan vi gøre bedre?', type: 'text', isRequired: false },
  ],
});

// Called only after the machine integration has verified brand/location/customer.
// Bootstrap once. Explicit operator selections, edits and deactivations survive retries.
export async function ensureBookingFeedbackQuestions(brandId: string) {
  const db = getAdminDb();
  if (brandId === ESMERALDA_FEEDBACK_BRAND) {
    const settingsRef = db.collection('feedbackSettings').doc(brandId);
    const versionRef = db.collection('feedbackQuestionsVersion').doc(ESMERALDA_BOOKING_VERSION);
    const lock = db.collection('feedbackConfiguration').doc('versionLock');
    await db.runTransaction(async tx => {
      const [brand, settings, version] = await Promise.all([
        tx.get(db.collection('brands').doc(brandId)), tx.get(settingsRef), tx.get(versionRef),
      ]);
      await tx.get(lock);
      if (!brand.exists) throw new Error('Booking feedback brand is unavailable.');
      if (settings.data()?.bookingQuestionVersionId) return;
      if (feedbackAutomation(settings.data()).language !== 'da') return;
      const timestamp = getAdminFieldValue().serverTimestamp();
      if (!version.exists) tx.create(versionRef, {
        ...ESMERALDA_BOOKING_QUESTIONS, id: ESMERALDA_BOOKING_VERSION,
        createdAt: timestamp, updatedAt: timestamp, createdBy: 'esmeralda-booking-integration',
      });
      tx.set(settingsRef, { bookingQuestionVersionId: ESMERALDA_BOOKING_VERSION,
        updatedAt: timestamp, updatedBy: 'esmeralda-booking-integration' }, { merge: true });
      tx.set(lock, { updatedAt: timestamp }, { merge: true });
    });
  }
  const settings = feedbackAutomation((await db.collection('feedbackSettings').doc(brandId).get()).data());
  // The central booking.feedback template is currently Danish.
  if (settings.language !== 'da' || !await readActiveQuestionsForBrand(brandId, 'booking', 'da')) {
    throw new Error('An active Danish booking feedback form must be configured before sending an invitation.');
  }
}
