
// src/app/api/ops/catalog/ensure-menu/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "default-no-store";

/**
 * POST /api/ops/catalog/ensure-menu
 * Headers: x-debug-token: <DEBUG_TOKEN>
 * Body:
 *  {
 *    "brandSlug": "esmeralda",         // påkrævet
 *    "menuCategoryName": "Menu",       // valgfri, default "Menu"
 *    "dryRun": true,                   // default true (første kald skal være dry-run)
 *    "reassignIfInvalid": true,        // tildel også hvis categoryId peger på ikke-eksisterende kategori
 *    "setSortOrder": true              // sæt sortOrder sekventielt hvis mangler
 *  }
 *
 * Response: { ok, brandId, categoryId, stats, dryRun, tookMs }
 */
export async function POST(req: Request) {
  const started = Date.now();
  const token = process.env.DEBUG_TOKEN;
  const hdr = (req.headers.get("x-debug-token") || "").trim();
  if (!token || hdr !== token) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const brandSlug: string = String(body.brandSlug || "").trim();
  const menuCategoryName: string = String(body.menuCategoryName || "Menu").trim();
  const dryRun: boolean = body.dryRun !== false; // default true
  const reassignIfInvalid: boolean = body.reassignIfInvalid !== false; // default true
  const setSortOrder: boolean = body.setSortOrder !== false; // default true

  if (!brandSlug) {
    return NextResponse.json({ ok: false, error: "brandSlug is required" }, { status: 400 });
  }

  const db = getAdminDb();

  // 1) Find brandId via slug eller docId
  let brandId: string | null = null;
  const bySlug = await db.collection("brands").where("slug", "==", brandSlug).limit(1).get();
  if (!bySlug.empty) brandId = bySlug.docs[0].id;
  if (!brandId) {
    const byId = await db.collection("brands").doc(brandSlug).get();
    if (byId.exists) brandId = byId.id;
  }
  if (!brandId) {
    return NextResponse.json({ ok: false, error: "Brand not found for slug", brandSlug }, { status: 404 });
  }

  // 2) Ensure Menu category exists for brand
  let categoryId: string | null = null;
  const catQ = await db.collection("categories")
    .where("brandId", "==", brandId)
    .where("categoryName", "==", menuCategoryName)
    .limit(1)
    .get();

  if (!catQ.empty) {
    categoryId = catQ.docs[0].id;
  } else {
    if (dryRun) {
      // do not create in dry-run, just simulate id
      categoryId = "DRY_RUN_CATEGORY_ID";
    } else {
      const ref = db.collection("categories").doc();
      await ref.set({
        brandId,
        categoryName: menuCategoryName,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      categoryId = ref.id;
    }
  }

  // 3) Read all categories for validity map (avoid composite indexes by post-filtering)
  const allCatsSnap = await db.collection("categories").where("brandId", "==", brandId).get();
  const validCategoryIds = new Set(allCatsSnap.docs.map(d => d.id));

  // 4) Fetch ALL products for brand (no composite indexes)
  const prodsSnap = await db.collection("products").where("brandId", "==", brandId).get();

  // Partition products
  const products = prodsSnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() as any }));
  const withoutCategory = products.filter(p => !p.data.categoryId);
  const withInvalidCategory = reassignIfInvalid
    ? products.filter(p => p.data.categoryId && !validCategoryIds.has(String(p.data.categoryId)))
    : [];

  // Optionally: set sequential sortOrder for those missing it (keep others)
  const needSortOrder = setSortOrder ? products.filter(p => typeof p.data.sortOrder !== "number") : [];

  // 5) Apply mutations in batches of 450
  const BATCH_LIMIT = 450;
  let updated = 0;
  let createdCategory = catQ.empty ? 1 : 0;
  let updatedSort = 0;

  if (!dryRun) {
    // (A) Assign category for withoutCategory
    for (let i = 0; i < withoutCategory.length; i += BATCH_LIMIT) {
      const slice = withoutCategory.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      for (const p of slice) {
        batch.update(p.ref, { categoryId, updatedAt: new Date() });
      }
      await batch.commit();
      updated += slice.length;
    }

    // (B) Reassign invalid categoryId if asked
    if (withInvalidCategory.length) {
      for (let i = 0; i < withInvalidCategory.length; i += BATCH_LIMIT) {
        const slice = withInvalidCategory.slice(i, i + BATCH_LIMIT);
        const batch = db.batch();
        for (const p of slice) {
          batch.update(p.ref, { categoryId, updatedAt: new Date() });
        }
        await batch.commit();
        updated += slice.length;
      }
    }

    // (C) Set sortOrder if missing (simple deterministic sequence by product id)
    if (needSortOrder.length) {
      // stable order: by existing sortOrder->id
      const sorted = [...products].sort((a, b) => {
        const ao = typeof a.data.sortOrder === "number" ? a.data.sortOrder : 999999;
        const bo = typeof b.data.sortOrder === "number" ? b.data.sortOrder : 999999;
        if (ao !== bo) return ao - bo;
        return String(a.id).localeCompare(String(b.id));
      });

      let i = 1;
      for (let j = 0; j < sorted.length; j += BATCH_LIMIT) {
        const slice = sorted.slice(j, j + BATCH_LIMIT);
        const batch = db.batch();
        for (const p of slice) {
          if (typeof p.data.sortOrder !== "number") {
            batch.update(p.ref, { sortOrder: i, updatedAt: new Date() });
            updatedSort++;
          }
          i++;
        }
        await batch.commit();
      }
    }
  }

  const tookMs = Date.now() - started;
  return NextResponse.json({
    ok: true,
    brandId,
    categoryId,
    dryRun,
    stats: {
      createdCategory,
      productsTotal: products.length,
      withoutCategory: withoutCategory.length,
      withInvalidCategory: withInvalidCategory.length,
      updatedProducts: updated,
      setSortOrder: setSortOrder ? needSortOrder.length : 0,
      updatedSortOrder: updatedSort,
    },
    tookMs,
  });
}

    