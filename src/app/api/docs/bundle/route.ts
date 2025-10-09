import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { DOC_WHITELIST, DOCS_DIR } from "@/lib/docs/whitelist";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const parts: string[] = [];
  for (const name of DOC_WHITELIST) {
    if (!name.endsWith(".md")) continue; // bundle kun markdown-filer
    const filePath = path.resolve(process.cwd(), DOCS_DIR, name);
    try {
      const data = await readFile(filePath, "utf8");
      parts.push(
        `\n\n<!-- ─────────────────────────────────────────────── -->\n<!-- ${name} -->\n<!-- ─────────────────────────────────────────────── -->\n\n${data.trim()}\n`
      );
    } catch (e) {
      parts.push(`\n\n<!-- ${name} (MISSING) -->\n`);
    }
  }

  const bundle = `# Orderfly — Documentation Bundle\nGenerated: ${new Date().toISOString()}\n${parts.join("\n")}`;
  const filename = "orderfly-documentation-bundle.md";

  return new NextResponse(bundle, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
