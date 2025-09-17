"use client";

type Version = {
  id: string;
  name?: string | null;
  label?: string | null;
  description?: string | null;
  createdAt?: number | null;
  active?: boolean | null;
  parentId?: string | null;
};

export default function FeedbackQuestionsClientPage({
  initialVersions,
}: {
  initialVersions: Version[];
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Feedback Questions</h1>
        <p className="text-sm text-muted-foreground">
          Oversigt over alle spørgsmål (collectionGroup: questions).
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Parent</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {!initialVersions || initialVersions.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={6}>
                    Ingen questions fundet.
                  </td>
                </tr>
              ) : (
                initialVersions.map((q) => (
                  <tr key={q.id} className="border-t">
                    <td className="px-4 py-3">{q.id}</td>
                    <td className="px-4 py-3">{q.parentId ?? "-"}</td>
                    <td className="px-4 py-3">{q.name ?? "-"}</td>
                    <td className="px-4 py-3">{q.label ?? "-"}</td>
                    <td className="px-4 py-3">
                      {q.createdAt ? new Date(q.createdAt).toLocaleString("da-DK") : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {q.active === true ? "Yes" : q.active === false ? "No" : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
