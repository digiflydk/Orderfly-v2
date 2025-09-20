import { getAdminDb } from "@/lib/firebase-admin";

async function getDocSafe(path: string) {
  try {
    const snap = await getAdminDb().doc(path).get();
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

export async function buildAllDebugPayload() {
  const adminDb = getAdminDb();
  
  const settingsGeneral = await getDocSafe("settings/general");
  const cmsHeader       = await getDocSafe("cms/pages/header/header");
  const cmsHome         = await getDocSafe("cms/pages/home/home");
  const cmsFooter       = await getDocSafe("cms/pages/footer/footer");

  let feedback = {
    ok: true,
    collection: "feedbackQuestionsVersion",
    count: 0,
    latest: [] as any[],
    error: null as string | null,
  };
  try {
    const qs = await adminDb.collection("feedbackQuestionsVersion").orderBy("updatedAt", "desc").limit(5).get();
    feedback.count = (await adminDb.collection("feedbackQuestionsVersion").limit(1).get()).size;
    feedback.latest = qs.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e: any) {
    feedback.ok = false;
    feedback.error = e?.message || String(e);
  }

  return {
    settingsGeneral,
    cmsHeader,
    cmsHome,
    cmsFooter,
    feedback,
  };
}
