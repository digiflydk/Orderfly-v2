

import { getFeedbackEntries } from "./actions";

function fmt(ts: number | null) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString("da-DK");
  } catch {
    return "-";
  }
}

export default async function FeedbackPage() {
  const feedback = await getFeedbackEntries();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Feedback</h1>
        <p className="text-sm text-muted-foreground">Indsamlet kundefeedback.</p>
      </div>
      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Dato</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Kommentar</th>
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Kunde</th>
                <th className="px-4 py-3 font-medium">Ordre</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Synlig</th>
              </tr>
            </thead>
            <tbody>
              {feedback.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted-foreground" colSpan={9}>Ingen feedback fundet.</td>
                </tr>
              ) : (
                feedback.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-4 py-3">{fmt(f.createdAt)}</td>
                    <td className="px-4 py-3">{f.rating ?? "-"}</td>
                    <td className="px-4 py-3">{f.comment ?? "-"}</td>
                    <td className="px-4 py-3">{f.brandId ?? "-"}</td>
                    <td className="px-4 py-3">{f.locationId ?? "-"}</td>
                    <td className="px-4 py-3">{f.customerId ?? "-"}</td>
                    <td className="px-4 py-3">{f.orderId ?? "-"}</td>
                    <td className="px-4 py-3">{f.version ?? "-"}</td>
                    <td className="px-4 py-3">{f.visible === true ? "true" : f.visible === false ? "false" : "-"}</td>
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
