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
    time: new Date().toISOString(),
  });
}
