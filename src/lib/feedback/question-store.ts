import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { FeedbackQuestionsVersionSchema } from '@/lib/schemas/feedback';
import { upsellClientData } from '@/lib/upsell-serialization';
import type { ExperienceFeedbackQuestionsVersion, FeedbackExperienceType } from './source-types';

function normalizeVersion(data: Record<string, unknown>): ExperienceFeedbackQuestionsVersion {
  const scope = data.scope === 'brand' ? 'brand' : 'default';
  return {
    ...data,
    scope,
    ...(scope === 'brand' ? { brandId: data.brandId as string | undefined } : { brandId: null }),
  } as ExperienceFeedbackQuestionsVersion;
}

function isActiveFor(version: ExperienceFeedbackQuestionsVersion, type: FeedbackExperienceType, language: string) {
  return FeedbackQuestionsVersionSchema.safeParse(version).success && version.isActive &&
    version.language === language && version.orderTypes?.includes(type);
}

function defaultVersion(versions: ExperienceFeedbackQuestionsVersion[], type: FeedbackExperienceType, language: string) {
  return versions.filter(version => version.scope === 'default' && isActiveFor(version, type, language))
    .sort((a, b) => a.id.localeCompare(b.id))[0] || null;
}

export async function readQuestionVersions(): Promise<ExperienceFeedbackQuestionsVersion[]> {
  const snapshot = await getAdminDb().collection('feedbackQuestionsVersion').get();
  return snapshot.docs.map(doc => normalizeVersion(upsellClientData({ ...doc.data(), id: doc.id }) as Record<string, unknown>))
    .sort((a, b) => String(a.versionLabel || '').localeCompare(String(b.versionLabel || '')) || a.id.localeCompare(b.id));
}

export async function readQuestionVersion(id: string): Promise<ExperienceFeedbackQuestionsVersion | null> {
  const doc = await getAdminDb().collection('feedbackQuestionsVersion').doc(id).get();
  return doc.exists ? normalizeVersion(upsellClientData({ ...doc.data(), id: doc.id }) as Record<string, unknown>) : null;
}

export async function readActiveQuestions(type: FeedbackExperienceType, language = 'da') {
  // Legacy versions without an explicit scope are normalized to the platform default.
  const versions = await readQuestionVersions();
  return defaultVersion(versions, type, language);
}

export async function readActiveQuestionsForBrand(brandId: string, type: FeedbackExperienceType, language = 'da') {
  const selected = (await getAdminDb().collection('feedbackSettings').doc(brandId).get()).data()?.questionVersionId;
  if (typeof selected === 'string' && /^[\w-]{1,160}$/.test(selected)) {
    const version = await readQuestionVersion(selected);
    const belongsToBrand = version?.scope === 'default' || (version?.scope === 'brand' && version.brandId === brandId);
    return version && belongsToBrand && isActiveFor(version, type, language) ? version : null;
  }
  const versions = await readQuestionVersions();
  const brandVersion = versions
    .filter(version => version.scope === 'brand' && version.brandId === brandId && isActiveFor(version, type, language))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return brandVersion || defaultVersion(versions, type, language);
}
