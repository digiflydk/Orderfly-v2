import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

export async function GET() {
  // Bevidst ingen firebase-admin her, så den altid svarer 200
  return NextResponse.json({
    ok: true,
    service: "orderfly",
    // The deployed commit, so post-merge verification can wait for the right build.
    release: process.env.NEXT_PUBLIC_RELEASE_SHA || "unknown",
    time: new Date().toISOString(),
  });
}
