import {
  createOrUpdateQuestionVersion,
  getQuestionVersionById,
} from "@/app/superadmin/feedback/actions";
import ClientFormBridge from "./ClientFormBridge";

type Params = { versionId: string };

export default async function EditFeedbackQuestionVersionPage({
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

      <ClientFormBridge
        mode="edit"
        id={versionId}
        initialData={initial ?? undefined}
        action={createOrUpdateQuestionVersion}
      />
    </div>
  );
}
