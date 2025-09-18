import { createOrUpdateQuestionVersion } from "@/app/superadmin/feedback/actions";
import ClientFormBridge from "../edit/[versionId]/ClientFormBridge";

export default function NewFeedbackQuestionVersionPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Opret spørgsmål</h1>
          <p className="text-sm text-muted-foreground">
            Opret en ny version af feedback-spørgsmål.
          </p>
        </div>
      </div>

      <ClientFormBridge mode="create" action={createOrUpdateQuestionVersion} />
    </div>
  );
}
