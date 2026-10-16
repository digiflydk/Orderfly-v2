import 'server-only';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { FeedbackQuestionsVersionSchema } from '@/lib/schemas/feedback';
import { readActiveQuestionsForBrand } from './question-store';

export const ESMERALDA_FEEDBACK_BRAND = 'oeypKaMyYcQjIwaa1PtV';
export const ESMERALDA_BOOKING_VERSION = 'esmeralda-booking-da-v1';

// Esmeralda's restaurant-visit questionnaire (#144). Brand-scoped and booking-only,
// so takeaway/delivery forms and other brands keep their own questions.
export const ESMERALDA_BOOKING_QUESTIONS = FeedbackQuestionsVersionSchema.parse({
  versionLabel: 'Esmeralda · Restaurantbesøg · Dansk v1',
  isActive: true,
  scope: 'brand',
  brandId: ESMERALDA_FEEDBACK_BRAND,
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

// Called by the verified booking integration before an invitation is queued.
// Creates the Esmeralda form once; an existing version, including operator edits
// or a deliberate deactivation, is never overwritten. Returns whether the brand
// has an active Danish booking form, so no invitation links to a missing form.
export async function ensureBookingFeedbackQuestions(brandId: string, deps: { db?: FirebaseFirestore.Firestore } = {}) {
  const db = deps.db ?? getAdminDb();
  if (brandId === ESMERALDA_FEEDBACK_BRAND) {
    const versionRef = db.collection('feedbackQuestionsVersion').doc(ESMERALDA_BOOKING_VERSION);
    const lock = db.collection('feedbackConfiguration').doc('versionLock');
    await db.runTransaction(async tx => {
      const [brand, version] = await Promise.all([tx.get(db.collection('brands').doc(brandId)), tx.get(versionRef)]);
      await tx.get(lock);
      if (!brand.exists || version.exists) return;
      const timestamp = getAdminFieldValue().serverTimestamp();
      tx.create(versionRef, { ...ESMERALDA_BOOKING_QUESTIONS, id: ESMERALDA_BOOKING_VERSION,
        createdAt: timestamp, updatedAt: timestamp, createdBy: 'esmeralda-booking-integration' });
      tx.set(lock, { updatedAt: timestamp }, { merge: true });
    });
  }
  return !!await readActiveQuestionsForBrand(brandId, 'booking', 'da');
}
