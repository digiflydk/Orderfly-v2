
import "server-only";
import { getAdminDb } from "@/lib/firebase-admin";

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

export async function getMenuForRender(params: { brandId: string }) {
  const db = getAdminDb();
  const catsSnap = await db.collection("categories").where("brandId","==",params.brandId).get();
  const categories = catsSnap.docs.map(d => ({ id:d.id, ...(d.data() as any) }));
  const prodsSnap = await db.collection("products").where("brandId","==",params.brandId).get();
  const allProducts = prodsSnap.docs.map(d => ({ id:d.id, ...(d.data() as any) })).filter(p => p.isActive !== false);
  const sortByOrder = (a:any,b:any)=>((typeof a.order==="number"?a.order:999999)-(typeof b.order==="number"?b.order:999999));
  categories.sort(sortByOrder); allProducts.sort(sortByOrder);

  if (categories.length===0){
    return { categories:[{id:"__virtual_menu__",name:"Menu",order:1,isVirtual:true}],
             productsByCategory:{ "__virtual_menu__": allProducts }, fallbackUsed:true as const };
  }
  const productsByCategory: Record<string,any[]> = {};
  for(const c of categories) productsByCategory[c.id]=[];
  for(const p of allProducts){
    const cid = p.categoryId && productsByCategory[p.categoryId] ? p.categoryId : categories[0].id;
    productsByCategory[cid].push(p);
  }
  for(const id of Object.keys(productsByCategory)) productsByCategory[id].sort(sortByOrder);
  return { categories, productsByCategory, fallbackUsed:false as const };
}
