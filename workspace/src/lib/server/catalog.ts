

import "server-only";
import { getAdminDb } from "@/lib/firebase-admin";
import type { MenuForRender, MenuCategory, MenuProduct } from "@/types/menu";


export type CatalogCounts = {
  categories: number; products: number; toppings?: number; comboMenus?: number; discounts?: number;
};

export async function getCatalogCounts(params: { brandId: string }): Promise<CatalogCounts> {
  const db = getAdminDb(); const { brandId } = params;
  const [cats, prods] = await Promise.all([
    db.collection("categories").where("brandId","==",brandId).count().get(),
    db.collection("products").where("brandId","==",brandId).count().get(),
  ]);
  let toppings=0, comboMenus=0, discounts=0;
  try { toppings = (await db.collection("toppings").where("brandId","==",brandId).count().get()).data().count; } catch {}
  try { comboMenus = (await db.collection("comboMenus").where("brandId","==",brandId).count().get()).data().count; } catch {}
  try { discounts = (await db.collection("discounts").where("brandId","==",brandId).count().get()).data().count; } catch {}
  return { categories: cats.data().count, products: prods.data().count, toppings, comboMenus, discounts };
}

export async function getMenuForRender(params: { brandId: string }): Promise<MenuForRender> {
  const db = getAdminDb();
  const catsSnap = await db.collection("categories").where("brandId","==",params.brandId).get();
  const categories: MenuCategory[] = catsSnap.docs.map(d => ({ id:d.id, ...(d.data() as any) }));
  const prodsSnap = await db.collection("products").where("brandId","==",params.brandId).get();
  const allProducts: MenuProduct[] = prodsSnap.docs.map(d => ({ id:d.id, ...(d.data() as any) })).filter(p => (p as any).isActive !== false);
  const sortByOrder = (a:any,b:any)=>((typeof a.order==="number"?a.order:999999)-(typeof b.order==="number"?b.order:999999));
  categories.sort(sortByOrder); allProducts.sort(sortByOrder);

  if (categories.length===0){
    const FALLBACK_CAT_ID = "__virtual_menu__";
    const fallbackCategories = [{ id: FALLBACK_CAT_ID, name: "Menu" }];
    const productsByCategory = { [FALLBACK_CAT_ID]: allProducts };
    return { categories: fallbackCategories, productsByCategory, fallbackUsed: true };
  }
  const productsByCategory: Record<string,MenuProduct[]> = {};
  for(const c of categories) productsByCategory[c.id]=[];
  for(const p of allProducts){
    const cid = (p as any).categoryId && productsByCategory[(p as any).categoryId] ? (p as any).categoryId : categories[0].id;
    productsByCategory[cid].push(p);
  }
  for(const id of Object.keys(productsByCategory)) productsByCategory[id].sort(sortByOrder);
  return { categories, productsByCategory, fallbackUsed:false };
}
