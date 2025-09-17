
import { getDebugSnapshotServer } from "@/services/debug"

export default async function Page() {
  const data = await getDebugSnapshotServer()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">System Debug Snapshot</h1>
        <p className="text-sm text-muted-foreground">Læseadgang til udvalgte Firestore-samlinger og versionstatus.</p>
      </div>

      <div className="grid gap-4">
        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-medium">Environment</h2>
          <div className="mt-2 text-sm">
            <div>NODE_ENV: {data.env.nodeEnv || "-"}</div>
            <div>App version: {data.env.appVersion || "-"}</div>
          </div>
        </div>

        <div className="rounded-xl border">
          <div className="px-4 py-3 border-b text-sm font-medium">Firestore Collections</div>
          <div className="divide-y">
            {data.firestore.collections.map((c) => (
              <details key={c.path} className="px-4 py-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {c.path} • {c.count} dokumenter (sample) {c.orderedByCreatedAt ? "• ordered by createdAt" : ""}
                </summary>
                <pre className="mt-3 overflow-x-auto text-xs bg-muted/40 rounded p-3">
                  {JSON.stringify(c.sample, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
