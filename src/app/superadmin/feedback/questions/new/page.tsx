
export const runtime = "nodejs";

import FeedbackQuestionVersionForm from "@/components/superadmin/feedback-question-version-form";
import { getPlatformSettings } from "@/app/superadmin/settings/actions";
import { requireQuestionAccess } from "@/lib/feedback/access";
import { feedbackScopeOptions } from "@/lib/feedback/admin-data";

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
  const access = await requireQuestionAccess();
  const [settings, options] = await Promise.all([getPlatformSettings(), feedbackScopeOptions(access)]);
  const supportedLanguages = resolveSupportedLanguages(settings);
  return (
    <FeedbackQuestionVersionForm
      mode="create"
      brands={options.brands}
      supportedLanguages={supportedLanguages}
    />
  );
}
