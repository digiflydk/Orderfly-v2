
// src/app/api/diag/health/route.ts
import { NextResponse } from "next/server";
import { adminHealthProbe } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

export async function GET() {
  const probe = await adminHealthProbe();
  const status = probe.ok ? 200 : 503;
  return NextResponse.json(
    {
      ok: probe.ok,
      service: "orderfly-admin-firestore",
      details: probe,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
