'use client';

import dynamic from 'next/dynamic';
import { createOrUpdateQuestionVersion } from '@/app/superadmin/feedback/actions';

const FeedbackQuestionVersionForm = dynamic(
  () =>
    import('@/components/superadmin/feedback-question-version-form').then(
      (m: any) => m.default ?? m.FeedbackQuestionVersionForm
    ),
  { ssr: false }
);

export function EditFormClient({ versionId, initialData }: { versionId: string; initialData: any }) {
  return (
    <FeedbackQuestionVersionForm
      mode="edit"
      id={versionId}
      initialData={initialData}
      action={createOrUpdateQuestionVersion}
    />
  );
}
