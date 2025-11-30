'use client';

import * as React from 'react';

interface EditFeedbackQuestionVersionFormClientProps {
  versionId: string;
  initialData: any;
}

export default function EditFeedbackQuestionVersionFormClient({
  versionId,
  initialData,
}: EditFeedbackQuestionVersionFormClientProps) {
  return (
    <div className="p-4 space-y-2">
      <h1 className="text-xl font-semibold">
        Feedback question edit (temporary stub)
      </h1>
      <p className="text-sm text-muted-foreground">
        This admin page is temporarily stubbed for the current release.
      </p>
      <p className="text-xs text-muted-foreground">
        versionId: {versionId}
      </p>
    </div>
  );
}
