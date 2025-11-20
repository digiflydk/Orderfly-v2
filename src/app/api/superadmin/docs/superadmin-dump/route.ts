
// src/app/api/superadmin/docs/superadmin-dump/route.ts
import { NextResponse } from "next/server";
import { isDebugSnapshotEnabled } from "@/lib/debug/flags";
import { buildAllDebugPayload } from "@/lib/debug/all";
import { requireSuperadminApi } from "@/lib/auth/superadmin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const authError = await requireSuperadminApi();
  if (authError) return authError;

  // Re-use the debug snapshot logic for the data dump
  const enabled = await isDebugSnapshotEnabled();
  if (!enabled) {
    return NextResponse.json(
      { ok: false, error: "Debug snapshot export is disabled via settings." },
      { status: 403 }
    );
  }

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
      "Content-Disposition": 'attachment; filename="orderfly-superadmin-dump.json"',
      "Cache-Control": "no-store",
    },
  });
}
