import { hashKey } from '@/lib/loyalty/stamp-card/model';
export const DISCOUNT_CARD_COLLECTIONS = { features:'discountCardFeatures', groups:'discountCardGroups', assignments:'discountCardAssignments', audit:'discountCardAudit' } as const;
export const discountCardAssignmentId = (brandId:string,customerId:string) => hashKey('discount-card',brandId,customerId);
export const assignmentId = discountCardAssignmentId;
export type { DiscountCardFeature, DiscountCardGroup, DiscountCardAssignment, DiscountCardAdminData } from './types';
