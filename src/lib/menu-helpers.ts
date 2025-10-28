
import type { MenuData, Product } from "@/types/menu";

export function productsForCategory(menu: MenuData, catId: string): Product[] {
  // single, typed place for the indexing
  return menu.productsByCategory[catId] ?? [];
}
