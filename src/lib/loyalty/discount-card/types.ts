export type DiscountCardLocationScope = { mode: 'all' | 'selected'; locationIds: string[] };
export type DiscountCardFeature = { brandId: string; companyId: string; version: number; enabled: boolean; locationScope: DiscountCardLocationScope; updatedAt: number };
export type DiscountCardGroup = { id: string; brandId: string; companyId: string; version: number; name: string; percentage: number; active: boolean; updatedAt: number };
export type DiscountCardAssignment = { id: string; brandId: string; companyId: string; customerId: string; memberId: string | null; groupId: string; version: number; status: 'pending' | 'active' | 'blocked'; startsAt: number | null; expiresAt: number | null; updatedAt: number };
export type DiscountCardAdminData = {
  feature: DiscountCardFeature; groups: DiscountCardGroup[]; assignments: DiscountCardAssignment[];
  locations: { id: string; name: string }[];
  customers: { id: string; name: string; email: string; memberId: string | null }[];
  customersTruncated: boolean; assignmentsTruncated: boolean;
};
