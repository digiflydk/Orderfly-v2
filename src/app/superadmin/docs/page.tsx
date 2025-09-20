export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import "server-only";
import Link from "next/link";
import { DOC_WHITELIST } from "@/lib/docs/whitelist";

export default async function DocumentationAdminPage() {
  const files = DOC_WHITELIST;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">Dokumentation</h1>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/api/docs/bundle"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm hover:bg-muted"
          prefetch={false}
        >
          Download samlet bundle (.md)
        </Link>

        <Link
          href="/api/debug/snapshot"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm hover:bg-muted"
          prefetch={false}
        >
          Download debug (JSON)
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
        Filer hentes fra <code>/docs</code> i repoet (whitelistet).
      </p>
    </div>
  );
}
