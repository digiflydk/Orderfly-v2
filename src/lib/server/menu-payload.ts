import 'server-only';
import type { Category, ComboMenu, ProductForMenu, ToppingOverride } from '@/types';
import type { MenuPayload } from '@/lib/menu-payload';

const productFields = ['id', 'brandId', 'locationIds', 'categoryId', 'productName', 'description', 'price', 'priceDelivery', 'imageUrl', 'comboOnly', 'isActive', 'allergenIds', 'toppingGroupIds', 'toppingGroupConditions', 'isFeatured', 'isNew', 'isPopular', 'sortOrder'] as const;
const categoryFields = ['id', 'brandId', 'locationIds', 'categoryName', 'description', 'isActive', 'sortOrder', 'icon'] as const;
const comboFields = ['id', 'brandId', 'locationIds', 'comboName', 'description', 'pickupPrice', 'deliveryPrice', 'calculatedNormalPricePickup', 'calculatedNormalPriceDelivery', 'priceDifferencePickup', 'priceDifferenceDelivery', 'imageUrl', 'activeDays', 'activeTimeSlots', 'orderTypes', 'tags', 'productGroups', 'startDate', 'endDate', 'isActive', 'createdAt', 'updatedAt', 'upgradeProductIds', 'storefrontVersions', 'isTestData'] as const;

function pick<T extends object, K extends keyof T>(value: T, fields: readonly K[]): Pick<T, K> {
  return Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) as Pick<T, K>;
}

/** Exclude administrative/import fields; losslessly intern repeated option IDs and override values. */
export function createMenuPayload(menu: {
  categories: Category[];
  productsByCategory: Record<string, ProductForMenu[]>;
  fallbackUsed?: boolean;
}): MenuPayload {
  const optionIds: string[] = [], overrideValues: ToppingOverride[] = [];
  const optionIndex = new Map<string, number>(), valueIndex = new Map<string, number>();
  const productsByCategory = Object.fromEntries(Object.entries(menu.productsByCategory).map(([category, products]) => [
    category,
    products.map(product => ({
      ...pick(product, productFields),
      ...(product.toppingOverrides == null ? {} : {
        toppingOverrides: Object.entries(product.toppingOverrides).map(([id, value]): [number, number] => {
          if (!optionIndex.has(id)) { optionIndex.set(id, optionIds.length); optionIds.push(id); }
          // Preserve every override value, including explicit false and zero; never infer defaults.
          const key = JSON.stringify(value);
          if (!valueIndex.has(key)) { valueIndex.set(key, overrideValues.length); overrideValues.push(value); }
          return [optionIndex.get(id)!, valueIndex.get(key)!];
        }),
      }),
    })),
  ]));
  return { categories: menu.categories.map(category => pick(category, categoryFields)), productsByCategory, optionIds, overrideValues,
    ...(menu.fallbackUsed === undefined ? {} : { fallbackUsed: menu.fallbackUsed }) };
}

export function menuCombo(combo: ComboMenu): ComboMenu {
  return pick(combo, comboFields);
}
