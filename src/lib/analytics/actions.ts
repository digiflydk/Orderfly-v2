export type FunnelFilters = { from?: string; to?: string; channel?: string };
export type FunnelPoint = { ts: number; orders: number; revenue: number };
export type FunnelData = { brandId: string; totals: { orders: number; revenue: number }; series: FunnelPoint[] };
export async function getFunnelDataForBrand(brandId: string, _filters?: FunnelFilters): Promise<FunnelData> {
  return { brandId, totals: { orders: 0, revenue: 0 }, series: [] };
}
