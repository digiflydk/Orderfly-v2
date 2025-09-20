import "server-only";
import { NextResponse } from "next/server";
import { buildAllDebugPayload } from "@/lib/debug/all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

export async function GET(request: Request) {
  const started = Date.now();
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");

  try {
    const fullPayload = await buildAllDebugPayload();
    let data;

    if (scope && scope in fullPayload) {
      data = { [scope]: (fullPayload as any)[scope] };
    } else {
      data = fullPayload;
    }

    const payload = {
      ok: true,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      data,
    };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      error: e?.message || String(e),
    }, { status: 500 });
  }
}
