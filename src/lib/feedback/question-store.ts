import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { FeedbackQuestionsVersionSchema } from '@/lib/schemas/feedback';
import { upsellClientData } from '@/lib/upsell-serialization';
import type { ExperienceFeedbackQuestionsVersion, FeedbackExperienceType } from './source-types';

export async function readQuestionVersions(): Promise<ExperienceFeedbackQuestionsVersion[]> {
  const snapshot = await getAdminDb().collection('feedbackQuestionsVersion').get();
  return snapshot.docs.map(doc => upsellClientData({ ...doc.data(), id: doc.id }) as ExperienceFeedbackQuestionsVersion)
    .sort((a, b) => String(a.versionLabel || '').localeCompare(String(b.versionLabel || '')) || a.id.localeCompare(b.id));
}

export async function readQuestionVersion(id: string): Promise<ExperienceFeedbackQuestionsVersion | null> {
  const doc = await getAdminDb().collection('feedbackQuestionsVersion').doc(id).get();
  return doc.exists ? upsellClientData({ ...doc.data(), id: doc.id }) as ExperienceFeedbackQuestionsVersion : null;
}

export async function readActiveQuestions(type: FeedbackExperienceType, language = 'da') {
  // Versions are currently platform-wide. Never choose a random language/version.
  const versions = await readQuestionVersions();
  return versions.filter(v => FeedbackQuestionsVersionSchema.safeParse(v).success && v.isActive && v.language === language && v.orderTypes?.includes(type))
    .sort((a, b) => a.id.localeCompare(b.id))[0] || null;
}
