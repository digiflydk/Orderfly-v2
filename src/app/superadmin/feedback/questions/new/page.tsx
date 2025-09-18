import FeedbackQuestionVersionForm from '@/components/superadmin/feedback-question-version-form';
import { getPlatformSettings } from '@/app/superadmin/settings/actions';

type Lang = { code: string; name: string };

function resolveSupportedLanguages(settings: any): Lang[] {
  const fromSettings: Lang[] | undefined =
    settings?.languageSettings?.supportedLanguages;

  // Robust fallback (bevar original intention: mindst DA/EN)
  if (Array.isArray(fromSettings) && fromSettings.length > 0) {
    return fromSettings;
  }
  return [
    { code: 'da', name: 'Danish' },
    { code: 'en', name: 'English' },
  ];
}

export default async function NewFeedbackQuestionVersionPage() {
  // ORIGINALT FLOW: hent settings og injicér supportedLanguages i formularen
  const settings = await getPlatformSettings();
  const supportedLanguages = resolveSupportedLanguages(settings);

  return (
    <FeedbackQuestionVersionForm
      supportedLanguages={supportedLanguages}
    />
  );
}
