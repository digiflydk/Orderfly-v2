
// __OF542_INIT__
// __OF541_PARAMS_INIT__
import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
export const runtime = "nodejs";

import { notFound } from 'next/navigation';
import { readQuestionVersion } from '@/lib/feedback/question-store';
import { requireQuestionAccess } from '@/lib/feedback/access';
import type { FeedbackQuestionsVersion } from '@/types';
import FeedbackQuestionVersionForm from '@/components/superadmin/feedback-question-version-form';
import { getPlatformSettings } from '@/app/superadmin/settings/actions';
import { feedbackScopeOptions } from '@/lib/feedback/admin-data';

type Lang = { code: string; name: string };

function resolveSupportedLanguages(settings: any): Lang[] {
  const from = settings?.languageSettings?.supportedLanguages;
  if (Array.isArray(from) && from.length > 0) return from as Lang[];
  return [
    { code: 'da', name: 'Danish' },
    { code: 'en', name: 'English' },
  ];
}

function normalizeId(raw: string): string {
  try { return decodeURIComponent(raw).trim().replace(/\.+$/, ""); } catch { return raw.trim().replace(/\.+$/, ""); }
}

export default async function EditFeedbackQuestionVersionPage(props: any){
  const params = await Promise.resolve((props as any)?.params ?? {});
  const searchParams = await Promise.resolve((props as any)?.searchParams ?? {});

  const access = await requireQuestionAccess();
  const normalizedId = normalizeId(params.versionId);
  const [version, settings, options] = await Promise.all([
    readQuestionVersion(normalizedId),
    getPlatformSettings(),
    feedbackScopeOptions(access),
  ]);
  if (!version) notFound();
  const supportedLanguages = resolveSupportedLanguages(settings);
  return (
    <FeedbackQuestionVersionForm
      mode="edit"
      version={version as FeedbackQuestionsVersion}
      brands={options.brands}
      supportedLanguages={supportedLanguages}
    />
  );
}
