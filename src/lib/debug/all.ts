// src/lib/debug/all.ts
import { getAdminDb } from "@/lib/firebase-admin";

type DocWrap<T> = { ok: boolean; exists: boolean; path: string; raw: T | null; error?: string };

function wrap<T>(path: string, snap: FirebaseFirestore.DocumentSnapshot): DocWrap<T> {
  return {
    ok: true,
    exists: snap.exists,
    path,
    raw: snap.exists ? (snap.data() as T) : null,
  };
}

function wrapError<T>(path: string, e: unknown): DocWrap<T> {
  return {
    ok: false,
    exists: false,
    path,
    raw: null,
    error: e instanceof Error ? e.message : String(e),
  };
}

async function safeGet<T>(path: string) {
  const db = getAdminDb();
  try {
    const snap = await db.doc(path).get();
    return wrap<T>(path, snap);
  } catch (e) {
    return wrapError<T>(path, e);
  }
}

async function listBrands(limit = 50) {
  const db = getAdminDb();
  try {
    const qs = await db.collection("brands").limit(limit).get();
    return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    return { __error__: e instanceof Error ? e.message : String(e) } as any;
  }
}

async function listLocations(brandId: string, limit = 100) {
  const db = getAdminDb();
  try {
    const qs = await db.collection(`brands/${brandId}/locations`).limit(limit).get();
    return qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    return { __error__: e instanceof Error ? e.message : String(e) } as any;
  }
}

export async function buildAllDebugPayload() {
  const startedAt = new Date().toISOString();
  const metaErrors: string[] = [];

  // Global CMS/settings
  const [settingsGeneral, cmsHeader, cmsFooter, cmsHome] = await Promise.all([
    safeGet<any>("settings/general"),
    safeGet<any>("cms/pages/header/header"),
    safeGet<any>("cms/pages/footer/footer"),
    safeGet<any>("cms/pages/home/home"),
  ]);

  [settingsGeneral, cmsHeader, cmsFooter, cmsHome].forEach((d) => {
    if (!d.ok && d.error) metaErrors.push(`${d.path}: ${d.error}`);
  });

  // Brands
  const brandsList = await listBrands();
  if ((brandsList as any).__error__) {
    metaErrors.push(`brands: ${(brandsList as any).__error__}`);
  }

  const brands: Array<{
    id: string;
    name?: string;
    cms: {
      header: DocWrap<any>;
      footer: DocWrap<any>;
      home: DocWrap<any>;
    };
    locations: Array<{
      id: string;
      name?: string;
      cms: {
        header: DocWrap<any>;
        footer: DocWrap<any>;
        home: DocWrap<any>;
      };
    }> | { __error__: string };
  }> = [];

  if (Array.isArray(brandsList)) {
    for (const b of brandsList) {
      const brandId = b.id as string;

      const [bHeader, bFooter, bHome] = await Promise.all([
        safeGet<any>(`brands/${brandId}/cms/pages/header/header`),
        safeGet<any>(`brands/${brandId}/cms/pages/footer/footer`),
        safeGet<any>(`brands/${brandId}/cms/pages/home/home`),
      ]);

      [bHeader, bFooter, bHome].forEach((d) => {
        if (!d.ok && d.error) metaErrors.push(`${d.path}: ${d.error}`);
      });

      const locs = await listLocations(brandId);
      let locations: any;

      if ((locs as any).__error__) {
        const msg = (locs as any).__error__;
        metaErrors.push(`brands/${brandId}/locations: ${msg}`);
        locations = { __error__: msg };
      } else if (Array.isArray(locs)) {
        locations = [];
        for (const l of locs) {
          const locId = l.id as string;
          const [lHeader, lFooter, lHome] = await Promise.all([
            safeGet<any>(`brands/${brandId}/locations/${locId}/cms/pages/header/header`),
            safeGet<any>(`brands/${brandId}/locations/${locId}/cms/pages/footer/footer`),
            safeGet<any>(`brands/${brandId}/locations/${locId}/cms/pages/home/home`),
          ]);
          [lHeader, lFooter, lHome].forEach((d) => {
            if (!d.ok && d.error) metaErrors.push(`${d.path}: ${d.error}`);
          });

          locations.push({
            id: locId,
            name: l.name,
            cms: { header: lHeader, footer: lFooter, home: lHome },
          });
        }
      }

      brands.push({
        id: brandId,
        name: b.name,
        cms: { header: bHeader, footer: bFooter, home: bHome },
        locations,
      });
    }
  }

  // Feedback (bevar eksisterende implementering så vidt muligt)
  // Eksempel: tæl versioner – hvis I har en mere detaljeret helper, kald den i stedet.
  const db = getAdminDb();
  let feedback: any = {};
  try {
    const qs = await db.collection("feedbackQuestionsVersion").limit(1).get();
    feedback = { versions: { count: qs.size } };
  } catch (e) {
    feedback = { error: e instanceof Error ? e.message : String(e) };
    metaErrors.push(`feedbackQuestionsVersion: ${feedback.error}`);
  }

  return {
    startedAt,
    globals: {
      settingsGeneral,
      cmsHeader,
      cmsFooter,
      cmsHome,
    },
    brands,
    feedback,
    meta: {
      errors: metaErrors,
      note:
        "Alle fejl er ikke-fatale og påvirker ikke HTTP-status for denne route. Manglende dokumenter returneres som exists=false/raw=null.",
    },
  };
}
