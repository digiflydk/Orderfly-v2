// src/types/menu.ts
export type Product = {
  id: string;
  productName?: string;
  name?: string;
  title?: string;
};

export type Category = {
  id: string;      // must be string (used as key)
  name: string;
};

export type MenuData = {
  categories: Category[];
  productsByCategory: Record<string, Product[]>;
  fallbackUsed?: boolean;
};

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
