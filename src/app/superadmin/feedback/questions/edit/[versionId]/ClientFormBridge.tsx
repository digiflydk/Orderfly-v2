"use client";

import dynamic from "next/dynamic";

const InnerForm = dynamic(
  () =>
    import("@/components/superadmin/feedback-question-version-form").then(
      (m: any) => m.default ?? m.FeedbackQuestionVersionForm
    ),
  { ssr: false }
);

type Props = {
  mode: "edit" | "create";
  id?: string;
  initialData?: any;
  action?: any;
};

export default function ClientFormBridge(props: Props) {
  return <InnerForm {...props} />;
}
