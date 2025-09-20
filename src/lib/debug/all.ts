// src/lib/debug/all.ts
import { getAdminDb } from "@/lib/firebase-admin";
import type { Brand, Location } from "@/types";

async function getDocSafe(path: string) {
  try {
    const snap = await getAdminDb().doc(path).get();
    return snap.exists ? snap.data() : null;
  } catch (e: any) {
    // Return null on any error (e.g., permission denied, not found is not an error here)
    return null;
  }
}

export async function buildAllDebugPayload() {
  const adminDb = getAdminDb();
  
  // 1. Globale dokumenter
  const [settingsGeneral, cmsHeader, cmsHome, cmsFooter] = await Promise.all([
    getDocSafe("settings/general"),
    getDocSafe("cms/pages/header/header"),
    getDocSafe("cms/pages/home/home"),
    getDocSafe("cms/pages/footer/footer"),
  ]);

  // 2. Hent alle brands og locations
  const brandsSnap = await adminDb.collection("brands").get();
  const locationsSnap = await adminDb.collection("locations").get();

  const allBrands = brandsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Brand) }));
  const allLocations = locationsSnap.docs.map(d => ({ id: d.id, ...(d.data() as Location) }));

  // 3. Byg den nestede struktur for brands og locations
  const brandDataPromises = allBrands.map(async (brand) => {
    const [brandCmsHeader, brandCmsFooter, brandCmsHome] = await Promise.all([
      getDocSafe(`brands/${brand.id}/cms/pages/header`),
      getDocSafe(`brands/${brand.id}/cms/pages/footer`),
      getDocSafe(`brands/${brand.id}/cms/pages/home`),
    ]);

    const locationsForBrand = allLocations.filter(loc => loc.brandId === brand.id);
    const locationDataPromises = locationsForBrand.map(async (location) => {
      const [locCmsHeader, locCmsFooter, locCmsHome] = await Promise.all([
        getDocSafe(`brands/${brand.id}/locations/${location.id}/cms/pages/header`),
        getDocSafe(`brands/${brand.id}/locations/${location.id}/cms/pages/footer`),
        getDocSafe(`brands/${brand.id}/locations/${location.id}/cms/pages/home`),
      ]);
      return {
        id: location.id,
        name: location.name,
        cms: {
          header: locCmsHeader,
          footer: locCmsFooter,
          home: locCmsHome,
        },
      };
    });

    return {
      id: brand.id,
      name: brand.name,
      cms: {
        header: brandCmsHeader,
        footer: brandCmsFooter,
        home: brandCmsHome,
      },
      locations: await Promise.all(locationDataPromises),
    };
  });

  // 4. Feedback (uændret)
  let feedback = {
    ok: true,
    collection: "feedbackQuestionsVersion",
    count: 0,
    latest: [] as any[],
    error: null as string | null,
  };
  try {
    const feedbackSnap = await adminDb.collection("feedbackQuestionsVersion").orderBy("updatedAt", "desc").limit(5).get();
    feedback.count = (await adminDb.collection("feedbackQuestionsVersion").count().get()).data().count;
    feedback.latest = feedbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e: any) {
    feedback.ok = false;
    feedback.error = e?.message || String(e);
  }

  // 5. Saml det hele
  return {
    settingsGeneral,
    cmsHeader,
    cmsHome,
    cmsFooter,
    brands: await Promise.all(brandDataPromises),
    feedback,
  };
}
