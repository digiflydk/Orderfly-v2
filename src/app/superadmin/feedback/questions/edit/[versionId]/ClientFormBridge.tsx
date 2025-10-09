"use client";

import * as FormModule from "@/components/superadmin/feedback-question-version-form";

const InnerForm =
  // fallback til både default- og named-export
  (FormModule as any).default ??
  (FormModule as any).FeedbackQuestionVersionForm;

type Props = {
  mode: "edit" | "create";
  id?: string;
  initialData?: any;
  action?: any;
};

export default function ClientFormBridge(props: Props) {
  const Comp: any = InnerForm;
  // Maks kompatibilitet: giv data under flere prop-navne
  const { initialData, ...rest } = props;
  const pass = {
    ...rest,
    initialData,
    version: initialData,
    data: initialData,
    defaultValues: initialData,
  };
  return <Comp {...pass} />;
}
