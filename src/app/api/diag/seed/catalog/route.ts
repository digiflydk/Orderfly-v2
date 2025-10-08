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

  const db = getAdminDb();
  const { brandSlug = "esmeralda", categoryName = "Menu" } = await req.json().catch(() => ({}));

  // find brand
  let brandId: string | null = null;
  const b = await db.collection("brands").where("slug", "==", brandSlug).limit(1).get();
  if (!b.empty) brandId = b.docs[0].id;
  if (!brandId) {
    const bd = await db.collection("brands").doc(brandSlug).get();
    if (bd.exists) brandId = bd.id;
  }
  if (!brandId) {
    return NextResponse.json({ ok: false, error: `Brand not found for slug=${brandSlug}` }, { status: 404 });
  }

  // ensure category exists
  let catId: string | null = null;
  const catQ = await db.collection("categories")
    .where("brandId", "==", brandId)
    .where("categoryName", "==", categoryName)
    .limit(1).get();

  if (!catQ.empty) {
    catId = catQ.docs[0].id;
  } else {
    const ref = db.collection("categories").doc();
    await ref.set({
      brandId,
      categoryName: categoryName,
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    catId = ref.id;
  }

  // assign categoryId to products that miss it
  const prods = await db.collection("products")
    .where("brandId", "==", brandId)
    .get();

  let updated = 0;
  const batch = db.batch();
  for (const doc of prods.docs) {
    const data = doc.data() as any;
    if (!data.categoryId) {
      batch.update(doc.ref, {
        categoryId: catId,
        updatedAt: new Date(),
      });
      updated++;
    }
  }
  if (updated > 0) {
    await batch.commit();
  }

  return NextResponse.json({
    ok: true,
    brandId,
    categoryId: catId,
    productsUpdated: updated,
  });
}
