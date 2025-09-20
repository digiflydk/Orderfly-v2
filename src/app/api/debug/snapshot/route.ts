
import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isDebugSnapshotEnabled } from "@/lib/debug/flags";
import { buildAllDebugPayload } from "@/lib/debug/all";

export async function GET() {
  // Feature-gate
  const enabled = await isDebugSnapshotEnabled();
  if (!enabled) {
    return NextResponse.json(
      { ok: false, error: "debug snapshot export is disabled" },
      { status: 403 }
    );
  }

  // Byg payload (samme som /api/debug/all)
  const payload = await buildAllDebugPayload();

  const body = JSON.stringify(
    { ok: true, timestamp: new Date().toISOString(), data: payload },
    null,
    2
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="orderfly-debug-all.json"',
      "Cache-Control": "no-store",
    },
  });
}
