
export const runtime = "nodejs";

import FeedbackQuestionVersionForm from "@/components/superadmin/feedback-question-version-form";
import { getPlatformSettings } from "@/app/superadmin/settings/actions";
import { requireSuperadmin } from "@/lib/auth/superadmin";

type Lang = { code: string; name: string };

function resolveSupportedLanguages(settings: any): Lang[] {
  const from = settings?.languageSettings?.supportedLanguages;
  if (Array.isArray(from) && from.length > 0) return from as Lang[];
  return [
    { code: 'da', name: 'Danish' },
    { code: 'en', name: 'English' },
  ];
}

export default async function NewFeedbackQuestionVersionPage() {
  await requireSuperadmin();
  const settings = await getPlatformSettings();
  const supportedLanguages = resolveSupportedLanguages(settings);
  return (
    <FeedbackQuestionVersionForm
      mode="create"
      supportedLanguages={supportedLanguages}
    />
  );
}
