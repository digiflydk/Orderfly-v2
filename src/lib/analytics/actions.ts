// Minimal, stabil implementation — kan udbygges senere
export type FunnelFilters = {
  from?: string; // ISO
  to?: string; // ISO
  channel?: string;
};

export type FunnelPoint = { ts: number; orders: number; revenue: number };

export type FunnelData = {
  brandId: string;
  totals: { orders: number; revenue: number };
  series: FunnelPoint[];
};

export async function getFunnelDataForBrand(
  brandId: string,
  _filters?: FunnelFilters,
): Promise<FunnelData> {
  // Returnér en gyldig tom struktur så UI kan rendere
  return {
    brandId,
    totals: { orders: 0, revenue: 0 },
    series: [],
  };
}
