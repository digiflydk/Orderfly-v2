
// src/app/api/diag/brand-location/seed/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

export async function POST(req: Request) {
  const token = process.env.DEBUG_TOKEN;
  const auth = (req.headers.get("x-debug-token") || "").trim();
  if (!token || auth !== token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { brandSlug, brandName, locationSlug, locationName } = body || {};
  if (!brandSlug || !locationSlug) {
    return NextResponse.json({ ok: false, error: "brandSlug and locationSlug required" }, { status: 400 });
  }

  const db = getAdminDb();
  // brand
  let brandRef = db.collection("brands").doc();
  const brandDoc = (await db.collection("brands").where("slug", "==", brandSlug).limit(1).get()).docs[0];
  if (brandDoc) brandRef = brandDoc.ref;
  await brandRef.set(
    { slug: brandSlug, name: brandName || brandSlug, updatedAt: new Date(), createdAt: new Date() },
    { merge: true }
  );

  // location
  let locRef = db.collection("locations").doc();
  const locDoc = (await db.collection("locations").where("slug", "==", locationSlug).limit(1).get()).docs[0];
  if (locDoc) locRef = locDoc.ref;
  await locRef.set(
    {
      slug: locationSlug,
      name: locationName || locationSlug,
      brandId: brandRef.id,
      updatedAt: new Date(),
      createdAt: new Date(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, brandId: brandRef.id, locationId: locRef.id }, { status: 200 });
}
