import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isAllowedDoc, DOCS_DIR } from "@/lib/docs/whitelist";
import { readFile } from "node:fs/promises";
import path from "node:path";

function contentType(name: string) {
  if (name.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "";

  if (!isAllowedDoc(name)) {
    return NextResponse.json({ ok: false, error: "File not allowed" }, { status: 400 });
  }

  const filePath = path.resolve(process.cwd(), DOCS_DIR, name);
  const data = await readFile(filePath);

  return new NextResponse(data as any, {
    status: 200,
    headers: {
      "Content-Type": contentType(name),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
