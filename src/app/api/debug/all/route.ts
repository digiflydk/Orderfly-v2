import "server-only";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "default-no-store";

async function getDocSafe(path: string) {
  try {
    const snap = await adminDb.doc(path).get();
    return {
      ok: true,
      exists: snap.exists,
      path,
      raw: snap.exists ? snap.data() : null,
    };
  } catch (e: any) {
    return { ok: false, exists: false, path, raw: null, error: e?.message || String(e) };
  }
}

export async function GET() {
  const started = Date.now();
  try {
    // Core settings we rely on across the app (tilpas/udvid efter behov)
    const settingsGeneral = await getDocSafe("settings/general");
    const cmsHeader       = await getDocSafe("cms/pages/header/header");
    const cmsHome         = await getDocSafe("cms/pages/home/home");
    const cmsFooter       = await getDocSafe("cms/pages/footer/footer");

    // Feedback stats (Orderfly-specific)
    let feedback = {
      ok: true,
      collection: "feedbackQuestionsVersion",
      count: 0,
      latest: [] as any[],
      error: null as string | null,
    };
    try {
      const qs = await adminDb.collection("feedbackQuestionsVersion").orderBy("updatedAt", "desc").limit(5).get();
      feedback.count = (await adminDb.collection("feedbackQuestionsVersion").limit(1).get()).size
        // Note: Firestore count() aggregations kan tilføjes senere; for nu en simpel size for første page.
      feedback.latest = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e: any) {
      feedback.ok = false;
      feedback.error = e?.message || String(e);
    }

    const payload = {
      ok: true,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      data: {
        settingsGeneral,
        cmsHeader,
        cmsHome,
        cmsFooter,
        feedback,
      },
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
