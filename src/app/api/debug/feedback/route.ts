import "server-only";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

export async function GET() {
  try {
    const qs = await adminDb
      .collection("feedbackQuestionsVersion")
      .orderBy("updatedAt", "desc")
      .limit(20)
      .get();

    const items = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, count: items.length, items }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
