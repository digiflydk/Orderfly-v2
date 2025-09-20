// src/app/api/debug/all/route.ts
import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

import { NextResponse } from "next/server";
import { buildAllDebugPayload } from "@/lib/debug/all";

export async function GET() {
  try {
    const data = await buildAllDebugPayload();
    return NextResponse.json(
      {
        ok: true,
        timestamp: new Date().toISOString(),
        data,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    // Sidste værn: hvis noget helt uventet kastes, returnér diagnostik i body
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[/api/debug/all] fatal:", message, stack);
    return NextResponse.json(
      { ok: false, error: message, stack },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
