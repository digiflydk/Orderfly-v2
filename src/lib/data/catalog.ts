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
  // 1) Hent kategorier
  const catsSnap = await db.collection("categories")
    .where("brandId", "==", params.brandId)
    .orderBy("sortOrder", "asc")
    .get();

  const categories = catsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // 2) Hvis ingen kategorier → Fallback: virtuelt "Menu" med alle aktive produkter
  if (categories.length === 0) {
    const productsSnap = await db.collection("products")
      .where("brandId", "==", params.brandId)
      .where("isActive", "==", true)
      .orderBy("sortOrder", "asc")
      .get();

    const products = productsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const virtualCategory = {
      id: "__virtual_menu__",
      categoryName: "Menu",
      order: 1,
      isVirtual: true,
    };

    return {
      categories: [virtualCategory],
      productsByCategory: {
        [virtualCategory.id]: products,
      },
      fallbackUsed: true as const,
    };
  }

  // 3) Normal path → produkter pr. kategori
  const productsByCategory: Record<string, any[]> = {};
  for (const c of categories) {
    const ps = await db.collection("products")
      .where("brandId", "==", params.brandId)
      .where("categoryId", "==", c.id)
      .where("isActive", "==", true)
      .orderBy("sortOrder", "asc")
      .get();
    productsByCategory[c.id] = ps.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }

  return { categories, productsByCategory, fallbackUsed: false as const };
}
