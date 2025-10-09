
import "server-only";
export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    console.error("[OF-521] ClientLog:", body);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[OF-521] ClientLog failed:", e?.message || e);
    return NextResponse.json({ ok: false, error: "log-failed" }, { status: 500 });
  }
}
