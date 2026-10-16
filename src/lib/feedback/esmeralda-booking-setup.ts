import 'server-only';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { FeedbackQuestionsVersionSchema } from '@/lib/schemas/feedback';
import { readActiveQuestionsForBrand } from './question-store';
import { questionScopeKey } from './question-scope';

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
// or a deliberate deactivation, is never overwritten. It is also not created
// when the brand already has another active Danish booking form, the same
// overlap the question admin rejects. Returns whether an invitation may be sent:
// a deactivated Esmeralda form stops invitations instead of falling back to the
// generic form, and otherwise the brand needs an active Danish booking form.
export async function ensureBookingFeedbackQuestions(brandId: string, deps: { db?: FirebaseFirestore.Firestore } = {}) {
  const db = deps.db ?? getAdminDb();
  if (brandId === ESMERALDA_FEEDBACK_BRAND) {
    const col = db.collection('feedbackQuestionsVersion');
    const versionRef = col.doc(ESMERALDA_BOOKING_VERSION);
    const lock = db.collection('feedbackConfiguration').doc('versionLock');
    const disabled = await db.runTransaction(async tx => {
      await tx.get(lock);
      const [brand, version, active] = await Promise.all([
        tx.get(db.collection('brands').doc(brandId)), tx.get(versionRef), tx.get(col.where('isActive', '==', true))]);
      if (version.exists) return version.data()?.isActive !== true;
      if (!brand.exists) return false;
      const overlap = active.docs.some(doc => questionScopeKey(doc.data()) === questionScopeKey(ESMERALDA_BOOKING_QUESTIONS) &&
        doc.data().language === 'da' && (doc.data().orderTypes || []).includes('booking'));
      if (overlap) return false;
      const timestamp = getAdminFieldValue().serverTimestamp();
      tx.create(versionRef, { ...ESMERALDA_BOOKING_QUESTIONS, id: ESMERALDA_BOOKING_VERSION,
        createdAt: timestamp, updatedAt: timestamp, createdBy: 'esmeralda-booking-integration' });
      tx.set(lock, { updatedAt: timestamp }, { merge: true });
      return false;
    });
    if (disabled) return false;
  }
  return !!await readActiveQuestionsForBrand(brandId, 'booking', 'da');
}
