'use server';
import { storefrontRows } from '@/lib/storefront-cache';
import { getActiveStandardDiscounts } from '@/app/superadmin/standard-discounts/actions';
import type { StandardDiscount } from '@/types';

export async function getStorefrontDiscounts(params: {brandId:string;locationId:string;deliveryType:'pickup'|'delivery'}) {
  const rows = await storefrontRows('standard_discounts', params.brandId, params.locationId);
  const discounts = rows.map((row: any) => ({...row, startDate:row.startDate ? new Date(row.startDate) : undefined, endDate:row.endDate ? new Date(row.endDate) : undefined})) as StandardDiscount[];
  return getActiveStandardDiscounts({...params,discountsForTest:discounts});
}
