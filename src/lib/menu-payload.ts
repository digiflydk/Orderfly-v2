import type { Category, ProductForMenu, ToppingOverride } from '@/types';

/** Only the server/client transport is compact. Ordering components retain ProductForMenu. */
export type MenuProductPayload = Omit<ProductForMenu, 'toppingOverrides'> & {
  toppingOverrides?: [option: number, value: number][];
};
export interface MenuPayload {
  categories: Category[];
  productsByCategory: Record<string, MenuProductPayload[]>;
  optionIds: string[];
  overrideValues: ToppingOverride[];
  fallbackUsed?: boolean;
}

export function readMenuPayload(menu: MenuPayload) {
  return {
    categories: menu.categories,
    fallbackUsed: menu.fallbackUsed,
    productsByCategory: Object.fromEntries(Object.entries(menu.productsByCategory).map(([category, products]) => [
      category,
      products.map(({ toppingOverrides, ...product }): ProductForMenu => ({
        ...product,
        ...(toppingOverrides === undefined ? {} : {
          toppingOverrides: Object.fromEntries(toppingOverrides.map(([option, value]) => [
            menu.optionIds[option], menu.overrideValues[value],
          ])),
        }),
      })),
    ])),
  };
}
