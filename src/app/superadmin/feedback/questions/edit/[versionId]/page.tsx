
import { createOrUpdateQuestionVersion, getQuestionVersionById } from "@/app/superadmin/feedback/actions";

type Params = { versionId: string };

export default async function EditQuestionVersionPage({ params }: { params: Params }) {
  const versionId = decodeURIComponent(params.versionId || "");
  const item = await getQuestionVersionById(versionId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Rediger spørgsmål</h1>
          <p className="text-sm text-muted-foreground">
            ID: {versionId}
          </p>
        </div>
      </div>

      <form action={createOrUpdateQuestionVersion} className="space-y-4 max-w-2xl">
        <input type="hidden" name="id" value={versionId} />

        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            name="name"
            defaultValue={item?.name ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Label</label>
          <input
            name="label"
            defaultValue={item?.label ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            name="description"
            defaultValue={item?.description ?? ""}
            className="w-full rounded-md border px-3 py-2 text-sm min-h-[96px]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Active</label>
          <select
            name="active"
            defaultValue={
              item?.active === true ? "true" : item?.active === false ? "false" : ""
            }
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">-</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Fields (JSON)</label>
          <textarea
            name="fields"
            defaultValue={
              item?.fields ? JSON.stringify(item.fields, null, 2) : ""
            }
            className="w-full rounded-md border px-3 py-2 text-sm font-mono min-h-[140px]"
            placeholder='[{ "id": "q1", "type": "rating", "label": "How was it?" }]'
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Gem ændringer
          </button>
          <a
            href="/superadmin/feedback/questions"
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Annullér
          </a>
        </div>
      </form>
    </div>
  );
}
