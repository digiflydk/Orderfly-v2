import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const brandSlug = url.searchParams.get("brandSlug")?.trim();

  if (!brandSlug) {
    return NextResponse.json({ ok: false, error: "Missing brandSlug" }, { status: 400 });
  }

  try {
    const db = getAdminDb();

    // Find brandId by slug or docId
    let brandId: string | null = null;
    const bySlug = await db.collection("brands").where("slug", "==", brandSlug).limit(1).get();
    if (!bySlug.empty) brandId = bySlug.docs[0].id;
    if (!brandId) {
      const byId = await db.collection("brands").doc(brandSlug).get();
      if (byId.exists) brandId = byId.id;
    }
    if (!brandId) {
      return NextResponse.json({ ok: false, error: "Brand not found", brandSlug }, { status: 404 });
    }

    // Quick counts
    const [cats, prods, tops, combos, discs] = await Promise.all([
      db.collection("categories").where("brandId", "==", brandId).get(),
      db.collection("products").where("brandId", "==", brandId).get(),
      db.collection("toppings").where("brandId", "==", brandId).get().catch(() => ({ size: 0 } as any)),
      db.collection("comboMenus").where("brandId", "==", brandId).get().catch(() => ({ size: 0 } as any)),
      db.collection("discounts").where("brandId", "==", brandId).get().catch(() => ({ size: 0 } as any)),
    ]);

    return NextResponse.json({
      ok: true,
      brandId,
      counts: {
        categories: cats.size || 0,
        products: prods.size || 0,
        toppings: (tops as any).size || 0,
        comboMenus: (combos as any).size || 0,
        discounts: (discs as any).size || 0,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
