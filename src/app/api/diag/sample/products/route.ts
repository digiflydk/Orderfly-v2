
// src/app/api/diag/sample/products/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const brandSlug = url.searchParams.get("brandSlug") || "";
  const limit = Math.min(Number(url.searchParams.get("limit") || 3), 25);

  if (!brandSlug) {
    return NextResponse.json({ ok: false, error: "Missing brandSlug" }, { status: 400 });
  }

  const db = getAdminDb();
  // find brandId by slug or id
  let brandId: string | null = null;
  const q = await db.collection("brands").where("slug", "==", brandSlug).limit(1).get();
  if (!q.empty) brandId = q.docs[0].id;
  if (!brandId) {
    const d = await db.collection("brands").doc(brandSlug).get();
    if (d.exists) brandId = d.id;
  }
  if (!brandId) {
    return NextResponse.json({ ok: false, error: "Brand not found for slug", brandSlug }, { status: 404 });
  }

  const snap = await db.collection("products").where("brandId", "==", brandId).limit(limit).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ ok: true, brandId, count: items.length, items }, { status: 200 });
}
