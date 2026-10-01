import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { questionVersionMatchesBrand, resolveActiveQuestionVersion } from './question-scope';
import { upsellClientData } from '@/lib/upsell-serialization';
import type { ExperienceFeedbackQuestionsVersion, FeedbackExperienceType } from './source-types';

export async function readQuestionVersions(brandIds: string[] | null = null): Promise<ExperienceFeedbackQuestionsVersion[]> {
  const snapshot = await getAdminDb().collection('feedbackQuestionsVersion').get();
  return snapshot.docs.map(doc => upsellClientData({ ...doc.data(), id: doc.id }) as ExperienceFeedbackQuestionsVersion)
    .filter(version => brandIds === null || brandIds.some(brandId => questionVersionMatchesBrand(version, brandId)))
    .sort((a, b) => String(a.versionLabel || '').localeCompare(String(b.versionLabel || '')) || a.id.localeCompare(b.id));
}

export async function readQuestionVersion(id: string): Promise<ExperienceFeedbackQuestionsVersion | null> {
  const doc = await getAdminDb().collection('feedbackQuestionsVersion').doc(id).get();
  return doc.exists ? upsellClientData({ ...doc.data(), id: doc.id }) as ExperienceFeedbackQuestionsVersion : null;
}

export async function readActiveQuestions(type: FeedbackExperienceType, language = 'da') {
  const versions = await readQuestionVersions();
  return resolveActiveQuestionVersion(versions, null, type, language);
}

export async function readActiveQuestionsForBrand(brandId: string, type: FeedbackExperienceType, language = 'da') {
  const selected = (await getAdminDb().collection('feedbackSettings').doc(brandId).get()).data()?.questionVersionId;
  return resolveActiveQuestionVersion(await readQuestionVersions([brandId]), brandId, type, language,
    typeof selected === 'string' ? selected : null);
}
