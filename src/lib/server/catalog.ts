

'use server';

import "server-only";
import { unstable_cache } from 'next/cache';
import { storefrontMedia } from '@/lib/storefront-media';
import { getAdminDb } from "@/lib/firebase-admin";
import type { MenuForRender, MenuCategory, MenuProduct, Category } from "@/types/menu";
import type { Product } from '@/types';

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

export async function getMenuForRender({ brandId, locationId }: { brandId: string, locationId: string }): Promise<MenuForRender> {
  return cachedMenu(brandId, locationId);
}
const cachedMenu = unstable_cache(async (brandId: string, locationId: string): Promise<MenuForRender> => {
  const db = getAdminDb();
  
  const categoriesQuery = db.collection("categories").where('locationIds', 'array-contains', locationId).where('isActive', '==', true);
  const productsQuery = db.collection("products").where('brandId','==', brandId).where('isActive', '==', true);

  const [catsSnap, prodsSnap] = await Promise.all([
    categoriesQuery.get(),
    productsQuery.get(),
  ]);

  const categories: MenuCategory[] = catsSnap.docs.filter(d => !d.data().brandId || d.data().brandId === brandId).map(d => storefrontMedia({ ...(d.data() as any), id:d.id }, 'categories', d.id));
  
  const allLocationProducts: MenuProduct[] = prodsSnap.docs
      .map(d => storefrontMedia({ ...(d.data() as any), id: d.id }, 'products', d.id))
      .filter(p => !p.locationIds || p.locationIds.length === 0 || p.locationIds.includes(locationId));

  const sortByOrder = (a:any,b:any)=>((typeof a.sortOrder==="number"?a.sortOrder:999999)-(typeof b.sortOrder==="number"?b.sortOrder:999999));
  
  categories.sort(sortByOrder);
  allLocationProducts.sort(sortByOrder);

  if (categories.length===0){
    const FALLBACK_CAT_ID = "__virtual_menu__";
    const fallbackCategories: MenuCategory[] = [{
      id: FALLBACK_CAT_ID,
      name: "Menu",
      categoryName: "Menu",
      isActive: true,
    }];
    const productsByCategory:Record<string, MenuProduct[]> = { [FALLBACK_CAT_ID]: allLocationProducts };
    return { categories: fallbackCategories, productsByCategory, fallbackUsed: true };
  }

  const productsByCategory: Record<string,MenuProduct[]> = {};
  for(const c of categories) productsByCategory[c.id]=[];
  
  for(const p of allLocationProducts){
    const cid = (p as any).categoryId && productsByCategory[(p as any).categoryId] ? (p as any).categoryId : categories[0].id;
    if (productsByCategory[cid]) {
        productsByCategory[cid].push(p);
    }
  }
  
  for(const id of Object.keys(productsByCategory)) productsByCategory[id].sort(sortByOrder);
  
  return { categories, productsByCategory, fallbackUsed:false };
}, ['storefront-menu-v1'], {revalidate:60,tags:['storefront']});
