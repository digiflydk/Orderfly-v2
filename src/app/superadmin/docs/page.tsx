export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import "server-only";
import Link from "next/link";

async function fetchList() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/docs/list`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load file list");
  return res.json() as Promise<{ ok: boolean; files: string[] }>;
}

export default async function DocumentationAdminPage() {
  const { files } = await fetchList();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Dokumentation</h1>

      <div className="flex items-center gap-3">
        <Link
          href="/api/docs/bundle"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm hover:bg-muted"
          prefetch={false}
        >
          Download samlet bundle (.md)
        </Link>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-medium mt-6">Enkeltfiler</h2>
        <ul className="list-disc pl-6 space-y-1">
          {files.map((name) => (
            <li key={name} className="flex items-center gap-3">
              <span className="font-mono text-sm">{name}</span>
              <Link
                href={`/api/docs/download?name=${encodeURIComponent(name)}`}
                className="text-primary hover:underline text-sm"
                prefetch={false}
              >
                Download
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground mt-8">
        Alle filer hentes fra <code>/docs</code> mappen i repo’et. Kun whitelisted navne kan downloades.
      </p>
    </div>
  );
}
