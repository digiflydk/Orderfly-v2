
import "server-only";
export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "orderfly-app",
    time: new Date().toISOString(),
  });
}
