'use client';

import * as React from 'react';
import BaseFeedbackQuestionVersionForm from '../../FeedbackQuestionVersionForm';
import { createOrUpdateQuestionVersion } from '../../actions';

// Local wrapper type: treat the base form as a React component that accepts props.
// This avoids the IntrinsicAttributes error in this client wrapper.
const FeedbackQuestionVersionForm =
  BaseFeedbackQuestionVersionForm as unknown as React.ComponentType<any>;

interface EditFeedbackQuestionVersionFormClientProps {
  versionId: string;
  initialData: any;
}

export default function EditFeedbackQuestionVersionFormClient({
  versionId,
  initialData,
}: EditFeedbackQuestionVersionFormClientProps) {
  return (
    <FeedbackQuestionVersionForm
      mode="edit"
      id={versionId}
      initialData={initialData}
      action={createOrUpdateQuestionVersion}
    />
  );
}
