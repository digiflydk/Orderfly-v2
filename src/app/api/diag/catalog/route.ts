// src/app/api/diag/catalog/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getCatalogCounts } from "@/lib/data/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const brandSlug = searchParams.get("brandSlug") || "";
  if (!brandSlug) {
    return NextResponse.json({ ok: false, error: "Missing brandSlug" }, { status: 400 });
  }

  const db = getAdminDb();

  // find brand by slug (eller docId==slug)
  let brandId: string | null = null;
  const q = await db.collection("brands").where("slug", "==", brandSlug).limit(1).get();
  if (!q.empty) brandId = q.docs[0].id;
  if (!brandId) {
    const doc = await db.collection("brands").doc(brandSlug).get();
    if (doc.exists) brandId = doc.id;
  }

  if (!brandId) {
    return NextResponse.json(
      { ok: false, error: "Brand not found for slug", brandSlug },
      { status: 404 }
    );
  }

  const counts = await getCatalogCounts({ brandId });
  return NextResponse.json({ ok: true, brandId, counts }, { status: 200 });
}
