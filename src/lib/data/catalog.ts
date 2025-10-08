
// src/lib/data/catalog.ts
import { getAdminDb } from "@/lib/firebase-admin";

export type CatalogCounts = {
  categories: number;
  products: number;
  toppings?: number;
  comboMenus?: number;
  discounts?: number;
};

export async function getCatalogCounts(params: {
  brandId: string;
  locationId?: string | null;
}): Promise<CatalogCounts> {
  const db = getAdminDb();
  const { brandId } = params;

  // Antag: categories/products har felt brandId (og evt. locationIds[] el. visibility)
  const [catSnap, prodSnap] = await Promise.all([
    db.collection("categories").where("brandId", "==", brandId).count().get(),
    db.collection("products").where("brandId", "==", brandId).count().get(),
  ]);

  // Valgfrie collections (tolerér NOT_FOUND)
  let toppings = 0, comboMenus = 0, discounts = 0;
  try {
    const s = await db.collection("toppings").where("brandId", "==", brandId).count().get();
    toppings = s.data().count;
  } catch {}
  try {
    const s = await db.collection("comboMenus").where("brandId", "==", brandId).count().get();
    comboMenus = s.data().count;
  } catch {}
  try {
    const s = await db.collection("discounts").where("brandId", "==", brandId).count().get();
    discounts = s.data().count;
  } catch {}

  return {
    categories: catSnap.data().count,
    products: prodSnap.data().count,
    toppings,
    comboMenus,
    discounts,
  };
}

export async function getMenuForRender(params: {
  brandId: string;
}) {
  const db = getAdminDb();
  // Meget simpel menu: hent categories (order) + produkter pr. kategori
  const cats = await db.collection("categories")
    .where("brandId", "==", params.brandId)
    .orderBy("sortOrder", "asc")
    .get();

  const categories = cats.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const productsByCategory: Record<string, any[]> = {};
  for (const c of categories) {
    const ps = await db.collection("products")
      .where("brandId", "==", params.brandId)
      .where("categoryId", "==", c.id)
      .orderBy("sortOrder", "asc")
      .get();
    productsByCategory[c.id] = ps.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  return { categories, productsByCategory };
}
