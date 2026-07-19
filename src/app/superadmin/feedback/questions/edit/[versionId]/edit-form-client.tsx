'use client';

import FeedbackQuestionVersionForm from '@/components/superadmin/feedback-question-version-form';
import type { FeedbackQuestionsVersion, LanguageSetting } from '@/types';

export function EditFormClient({
  version,
  supportedLanguages,
}: {
  version: FeedbackQuestionsVersion;
  supportedLanguages: LanguageSetting[];
}) {
  return (
    <FeedbackQuestionVersionForm
      version={version}
      supportedLanguages={supportedLanguages}
    />
  );
}
