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
  // 1) Hent alle kategorier for brand (ingen where på isActive/visibility her)
  const catsSnap = await db
    .collection("categories")
    .where("brandId", "==", params.brandId)
    .get();

  const categories = catsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  // 2) Hent ALLE produkter for brand (KUN brandId-filter → ingen composite index krævet)
  const prodsSnap = await db
    .collection("products")
    .where("brandId", "==", params.brandId)
    .get();

  // Filtrér/sortér i memory for at undgå Firestore index-krav
  const allProducts = prodsSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as any) }))
    .filter(p => p.isActive !== false); // default: vis hvis ikke eksplicit deaktiveret
  const sortByOrder = (a: any, b: any) => {
    const ao = typeof a.order === "number" ? a.order : 999999;
    const bo = typeof b.order === "number" ? b.order : 999999;
    return ao - bo;
  };
  allProducts.sort(sortByOrder);
  categories.sort(sortByOrder);

  // 3) Fallback: ingen kategorier ⇒ virtuel "Menu" med alle produkter
  if (categories.length === 0) {
    return {
      categories: [{ id: "__virtual_menu__", name: "Menu", order: 1, isVirtual: true }],
      productsByCategory: { __virtual_menu__: allProducts },
      fallbackUsed: true as const,
    };
  }

  // 4) Normal path: bucketér produkter pr. kategoriId
  const productsByCategory: Record<string, any[]> = {};
  for (const c of categories) productsByCategory[c.id] = [];
  for (const p of allProducts) {
    const cid = p.categoryId && productsByCategory[p.categoryId] ? p.categoryId : categories[0].id;
    productsByCategory[cid].push(p);
  }
  for (const cid of Object.keys(productsByCategory)) {
    productsByCategory[cid].sort(sortByOrder);
  }

  return { categories, productsByCategory, fallbackUsed: false as const };
}


// ---- Display helpers (NEW) ----
export function getDisplayName(p: any): string {
  return (
    (typeof p?.name === "string" && p.name) ||
    (typeof p?.title === "string" && p.title) ||
    (typeof p?.label === "string" && p.label) ||
    ""
  );
}

export function getDisplayPrice(p: any): number | null {
  if (typeof p?.price === "number") return p.price;
  if (typeof p?.amount === "number") return p.amount;
  // string to number fallback
  if (typeof p?.price === "string" && p.price.trim() !== "" && !isNaN(Number(p.price))) {
    return Number(p.price);
  }
  if (typeof p?.amount === "string" && p.amount.trim() !== "" && !isNaN(Number(p.amount))) {
    return Number(p.amount);
  }
  return null;
}

export function formatDKK(value: number | null): string {
  if (value == null) return "";
  try {
    return new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${Math.round(value)} kr`;
  }
}