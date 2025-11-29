'use server';

import type { FunnelFilters, FunnelOutput } from '@/types';

export async function getFunnelDataForBrand(brandId: string, filters: FunnelFilters): Promise<FunnelOutput> {
  // Stub implementation - replace with actual analytics logic
  return {
    totals: {
      sessions: 0,
      view_menu: 0,
      view_product: 0,
      add_to_cart: 0,
      start_checkout: 0,
      click_purchase: 0,
      payment_succeeded: 0,
      payment_session_created: 0,
      revenue_paid: 0,
      delivery_fees_total: 0,
      discounts_total: 0,
      upsell_offer_shown: 0,
      upsell_accepted: 0,
      upsell_rejected: 0,
    },
    daily: [],
    byLocation: [],
  };
}
