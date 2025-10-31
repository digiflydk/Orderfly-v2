
// src/types/menu.ts
import type { Category as FullCategory, Product as FullProduct } from '@/types';

// Types specific to menu rendering
export type MenuCategory = Omit<FullCategory, 'brandId' | 'locationIds'> & { name: string };
export type MenuProduct = Omit<FullProduct, 'name' | 'title'>;
export type Product = FullProduct;
export type Category = FullCategory;


export type MenuData = {
  categories: Category[];
  productsByCategory: Record<string, Product[]>;
  fallbackUsed?: boolean;
};

export interface MenuForRender {
  categories: MenuCategory[];
  productsByCategory: Record<string, MenuProduct[]>;
  fallbackUsed: boolean;
}

// Narrow a loose union (Record<string, any[]> | { __virtual_menu__: any[] })
export function normalizeProductsDict(
  dict: unknown
): Record<string, Product[]> {
  if (dict && typeof dict === "object") {
    const anyDict = dict as Record<string, Product[]> & { __virtual_menu__?: Product[] };
    // If we ever receive the legacy __virtual_menu__ bucket, keep it addressable
    if (Array.isArray(anyDict.__virtual_menu__)) return anyDict;
    return anyDict;
  }
  return {};
}

/** Safe accessor that tolerates legacy (__virtual_menu__) + ensures string key */
export function productsForCategory(
  dict: unknown,
  catId: string
): Product[] {
  const d = normalizeProductsDict(dict);
  return d[String(catId)] ?? (d as any).__virtual_menu__ ?? [];
}
