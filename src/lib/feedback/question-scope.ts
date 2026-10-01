import { FeedbackQuestionsVersionSchema } from '@/lib/schemas/feedback';
import type { ExperienceFeedbackQuestionsVersion, FeedbackExperienceType } from './source-types';

type Scope = { scope?: 'default' | 'brand'; brandId?: string | null };
export function questionScopeKey(version: Scope) {
  return version.scope === 'brand' ? `brand:${version.brandId}` : 'default';
}
export function questionVersionMatchesBrand(version: Scope, brandId: string) {
  return version.scope === 'brand' ? version.brandId === brandId : !version.brandId;
}

/** A brand override wins; a selection only applies to compatible experiences. */
export function resolveActiveQuestionVersion(
  versions: ExperienceFeedbackQuestionsVersion[], brandId: string | null,
  type: FeedbackExperienceType, language: string, selectedId?: string | null,
) {
  const compatible = versions.filter(version => FeedbackQuestionsVersionSchema.safeParse(version).success &&
    version.isActive && version.language === language && version.orderTypes.includes(type) &&
    (brandId ? questionVersionMatchesBrand(version, brandId) : questionScopeKey(version) === 'default'));
  const preferred = (rows: ExperienceFeedbackQuestionsVersion[]) =>
    rows.find(version => version.id === selectedId) || rows.sort((a, b) => a.id.localeCompare(b.id))[0] || null;
  return preferred(compatible.filter(version => version.scope === 'brand')) ||
    preferred(compatible.filter(version => version.scope !== 'brand'));
}
