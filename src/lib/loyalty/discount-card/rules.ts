import { z } from 'zod';
import type { DiscountCardAssignment, DiscountCardFeature, DiscountCardGroup, DiscountCardLocationScope } from './types';
export const discountCardIdSchema = z.string().trim().min(1).max(200).refine(v => !v.includes('/') && v !== '.' && v !== '..', 'invalid_identifier');
const epoch = z.number().int().nonnegative().max(8.64e15);
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
export const discountCardLocationScopeSchema = z.object({ mode: z.enum(['all','selected']), locationIds: z.array(discountCardIdSchema).max(500) }).strict().superRefine((scope,ctx) => {
  if (new Set(scope.locationIds).size !== scope.locationIds.length || (scope.mode === 'all' && scope.locationIds.length !== 0) || (scope.mode === 'selected' && scope.locationIds.length === 0)) ctx.addIssue({code:'custom',message:'invalid_location_scope'});
});
export const saveDiscountCardFeatureSchema = z.object({brandId:discountCardIdSchema,version,enabled:z.boolean(),locationScope:discountCardLocationScopeSchema}).strict();
export const saveDiscountCardGroupSchema = z.object({brandId:discountCardIdSchema,id:discountCardIdSchema,version,name:z.string().trim().min(1).max(80),percentage:z.number().positive().max(100).multipleOf(0.01),active:z.boolean()}).strict();
export const saveDiscountCardAssignmentSchema = z.object({brandId:discountCardIdSchema,customerId:discountCardIdSchema,memberId:discountCardIdSchema.nullable(),groupId:discountCardIdSchema,version,status:z.enum(['pending','active','blocked']),startsAt:epoch.nullable(),expiresAt:epoch.nullable()}).strict().refine(v=>v.startsAt===null||v.expiresAt===null||v.expiresAt>v.startsAt,{message:'invalid_validity'});
export const discountCardFeatureSchema = z.object({brandId:discountCardIdSchema,companyId:discountCardIdSchema,version,enabled:z.boolean(),locationScope:discountCardLocationScopeSchema,updatedAt:epoch}).strict();
export const discountCardGroupSchema = z.object({id:discountCardIdSchema,brandId:discountCardIdSchema,companyId:discountCardIdSchema,version,name:z.string().trim().min(1).max(80),percentage:z.number().positive().max(100).multipleOf(0.01),active:z.boolean(),updatedAt:epoch}).strict();
export const discountCardAssignmentSchema = z.object({id:discountCardIdSchema,brandId:discountCardIdSchema,companyId:discountCardIdSchema,customerId:discountCardIdSchema,memberId:discountCardIdSchema.nullable(),groupId:discountCardIdSchema,version,status:z.enum(['pending','active','blocked']),startsAt:epoch.nullable(),expiresAt:epoch.nullable(),updatedAt:epoch}).strict().refine(v=>v.startsAt===null||v.expiresAt===null||v.expiresAt>v.startsAt,{message:'invalid_validity'});
export function defaultDiscountCardFeature(brandId:string,companyId:string):DiscountCardFeature { return {brandId,companyId,version:0,enabled:false,locationScope:{mode:'all',locationIds:[]},updatedAt:0}; }
export function discountCardLocationAllowed(scope:DiscountCardLocationScope, locationId:string):boolean { return !!locationId && (scope.mode==='all'||scope.locationIds.includes(locationId)); }
/** All inputs must be authoritative server records. This does not verify identity or load location ownership. */
export function discountCardEligible(feature:DiscountCardFeature,group:DiscountCardGroup,assignment:DiscountCardAssignment,context:{brandId:string;companyId:string;customerId:string;locationId:string;now:number}):boolean {
 return feature.enabled && group.active && assignment.status==='active' && [feature,group,assignment].every(row=>row.brandId===context.brandId&&row.companyId===context.companyId) && assignment.customerId===context.customerId && assignment.groupId===group.id && discountCardLocationAllowed(feature.locationScope,context.locationId) && (assignment.startsAt===null||assignment.startsAt<=context.now) && (assignment.expiresAt===null||assignment.expiresAt>context.now) && Number.isFinite(context.now) && group.percentage>0 && group.percentage<=100;
}
/** Round percentage discount once on eligible merchandise subtotal, never fees. */
export function discountCardAmountOre(eligibleSubtotalOre:number,percentage:number):number {
 if (!Number.isSafeInteger(eligibleSubtotalOre)||eligibleSubtotalOre<0||!Number.isFinite(percentage)||percentage<=0||percentage>100) throw new Error('invalid_discount_amount');
 const basisPoints=Math.round(percentage*100);
 if(Math.abs(percentage*100-basisPoints)>1e-7)throw new Error('invalid_discount_amount');
 return Number((BigInt(eligibleSubtotalOre)*BigInt(basisPoints)+5000n)/10000n);
}
