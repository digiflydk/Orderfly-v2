'use server';

import type { FunnelFilters, FunnelOutput } from '@/types';

export async function getFunnelDataForBrand(brandId: string, filters: FunnelFilters): Promise<FunnelOutput> {
  // Stub implementation - replace with actual analytics logic
  return {
    totals: {
      viewedProduct: 0,
      addedToCart: 0,
      startedCheckout: 0,
      completedOrder: 0,
      revenue: 0,
    },
    daily: [],
    byLocation: [],
  };
}
