import type { Topping, ToppingGroup } from '@/types';
import { publicRead } from './public-read';

type ProductOptions = { toppings: Topping[]; groups: ToppingGroup[] };

/** One shared scoped read; only transient transport errors permit one GET retry. */
export function readProductOptions(brandId: string, locationId: string): Promise<ProductOptions> {
  if (![brandId, locationId].every(id => /^[^/\\?#]{1,160}$/.test(id))) return Promise.reject(new Error('Invalid restaurant'));
  const scoped = (row: unknown): boolean => !!row && typeof row === 'object'
    && typeof (row as Topping).id === 'string' && !!(row as Topping).id
    && Array.isArray((row as Topping).locationIds) && (row as Topping).locationIds.length === 1
    && (row as Topping).locationIds[0] === locationId;
  const valid = (value: unknown): value is ProductOptions => !!value && typeof value === 'object'
    && Array.isArray((value as ProductOptions).toppings) && Array.isArray((value as ProductOptions).groups)
    && (value as ProductOptions).groups.every(scoped)
    && (value as ProductOptions).toppings.every(row => scoped(row) && typeof row.groupId === 'string' && Number.isFinite(row.price));
  return publicRead(`/api/public/product-options?${new URLSearchParams({brandId, locationId})}`, 5000, { retryTransient: true, validate: valid });
}
