// src/app/api/debug/all/route.ts
import "server-only";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

import { NextResponse } from "next/server";
import { buildAllDebugPayload } from "@/lib/debug/all";
import { adminHealthProbe } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const adminHealth = await adminHealthProbe();
    if (!adminHealth.ok) {
        // If the core admin SDK isn't working, fail early with a clear message.
        return NextResponse.json(
          {
            ok: false,
            error: "Firebase Admin SDK failed to initialize. Check service account credentials.",
            details: adminHealth.error,
          },
          { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }
    
    const data = await buildAllDebugPayload();
    
    // Inject adminHealth into the meta object
    if (data && (data as any).meta) {
      (data as any).meta.adminHealth = adminHealth;
    }

    return NextResponse.json(
      {
        ok: true,
        timestamp: new Date().toISOString(),
        data,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    // This will catch errors from buildAllDebugPayload if they occur
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error("[/api/debug/all] fatal:", message, stack);
    return NextResponse.json(
      { ok: false, error: message, stack },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
