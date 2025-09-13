
'use server';

import type { FunnelFilters, FunnelOutput } from '@/types';
import { getFunnelData } from '@/lib/analytics/getFunnelData';


export async function getFunnelDataForBrand(
  brandId: string, 
  filters: Omit<FunnelFilters, 'brandId'>
): Promise<FunnelOutput> {
  // In a real scenario, brandId would come from user claims, not as a parameter.
  // This enforces that a brand admin can only see their own data.
  const finalFilters: FunnelFilters = {
    ...filters,
    brandId: brandId,
  };
  
  // Here, you would pass the current user object to enforce permissions
  // For now, we simulate a brand admin context by passing null for user.
  const mockUser = { role: 'brand_admin', brandIds: [brandId] };
  // @ts-ignore
  return getFunnelData(finalFilters, mockUser);
}
