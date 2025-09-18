import FeedbackQuestionVersionForm from "@/components/superadmin/feedback-question-version-form";
import {
  createOrUpdateQuestionVersion,
  getQuestionVersionById,
} from "@/app/superadmin/feedback/actions";

type Params = { versionId: string };

export default async function EditQuestionVersionPage({
  params,
}: {
  params: Params;
}) {
  const versionId = decodeURIComponent(params.versionId || "");
  const initial = await getQuestionVersionById(versionId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Rediger spørgsmål</h1>
          <p className="text-sm text-muted-foreground">ID: {versionId}</p>
        </div>
      </div>

      <FeedbackQuestionVersionForm
        mode="edit"
        id={versionId}
        initialData={initial ?? undefined}
        action={createOrUpdateQuestionVersion}
      />
    </div>
  );
}
