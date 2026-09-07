import { z } from 'zod';

const activeTimeSlotSchema = z.object({
	start: z.string(),
	end: z.string(),
});

export const standardDiscountSchema = z.object({
	id: z.string().optional(),
	brandId: z.string().min(1, 'A brand must be selected.'),
	locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
	discountName: z.string().min(2, 'Discount name is required.'),
	discountType: z.enum(['product', 'category', 'cart', 'free_delivery']),
	referenceIds: z.array(z.string()).optional().default([]),
	discountMethod: z.enum(['percentage', 'fixed_amount', 'buy_x_pay_y', 'bundle_price', 'quantity_tiers']),
	discountValue: z.coerce.number().positive('Discount value must be positive.').optional(),
 buyQuantity: z.coerce.number().int().min(2).max(1000).optional(),
 bundlePrice: z.coerce.number().positive().max(1000000).optional(),
 quantityTiers: z.array(z.object({
   minQuantity: z.coerce.number().int().min(2).max(1000),
   method: z.enum(['percentage', 'fixed_amount']),
   value: z.coerce.number().positive().max(1000000),
 })).max(20).optional(),
 payQuantity: z.coerce.number().int().min(1).max(999).optional(),
	minOrderValue: z.coerce.number().min(0).optional(),
	isActive: z.boolean().default(true),
	orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type is required.'),
	activeDays: z.array(z.string()).optional().default([]),
	activeTimeSlots: z.array(activeTimeSlotSchema).optional().default([]),
	timeSlotValidationType: z.enum(['orderTime', 'pickupTime']),
	startDate: z.date().optional(),
	endDate: z.date().optional(),
	allowStacking: z.boolean().default(false),
	// New marketing fields
	discountHeading: z.string().optional(),
	discountDescription: z.string().optional(),
	discountImageUrl: z.string().url({ message: "Please enter a valid URL." }).or(z.literal('')).optional().nullable(),
	assignToOfferCategory: z.boolean().default(false),
}).superRefine((data, ctx) => {
 if (['buy_x_pay_y', 'bundle_price', 'quantity_tiers'].includes(data.discountMethod) && !['product', 'category'].includes(data.discountType)) ctx.addIssue({code:'custom',path:['discountMethod'],message:'Quantity offers require products or categories.'});
 if (data.discountMethod === 'bundle_price') {
   if (!data.buyQuantity) ctx.addIssue({code:'custom',path:['buyQuantity'],message:'Choose a bundle quantity.'});
   if (!data.bundlePrice) ctx.addIssue({code:'custom',path:['bundlePrice'],message:'Enter the total bundle price.'});
 }
 if (data.discountMethod === 'quantity_tiers') {
   if (!data.quantityTiers?.length) ctx.addIssue({code:'custom',path:['quantityTiers'],message:'Add at least one quantity tier.'});
   const seen = new Set<number>();
   data.quantityTiers?.forEach((tier,i) => {
     if (seen.has(tier.minQuantity)) ctx.addIssue({code:'custom',path:['quantityTiers',i,'minQuantity'],message:'Quantity thresholds must be unique.'});
     seen.add(tier.minQuantity);
     if (tier.method === 'percentage' && tier.value > 100) ctx.addIssue({code:'custom',path:['quantityTiers',i,'value'],message:'Percentage must not exceed 100.'});
   });
 }
 if (data.discountMethod === 'buy_x_pay_y') {
  if (!['product', 'category'].includes(data.discountType)) ctx.addIssue({code:'custom',path:['discountMethod'],message:'Quantity offers require products or categories.'});
  if (!data.buyQuantity || !data.payQuantity || data.payQuantity >= data.buyQuantity) ctx.addIssue({code:'custom',path:['payQuantity'],message:'Choose X > Y, for example buy 3 and pay for 2.'});
 }
 if (data.discountMethod === 'percentage' && (data.discountValue || 0) > 100) ctx.addIssue({code:'custom',path:['discountValue'],message:'Percentage must not exceed 100.'});
	if (data.discountType === 'product' && (!data.referenceIds || data.referenceIds.length === 0)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['referenceIds'],
			message: 'At least one Product must be selected for this discount type.',
		});
	}
	if (data.discountType === 'category' && (!data.referenceIds || data.referenceIds.length === 0)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['referenceIds'],
			message: 'At least one Category must be selected for this discount type.',
		});
	}
	if ((data.discountType === 'cart' || data.discountType === 'free_delivery') && (!data.minOrderValue || data.minOrderValue <= 0)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['minOrderValue'],
			message: 'A minimum order value is required for this discount type.',
		});
	}
	if ((data.discountMethod === 'percentage' || data.discountMethod === 'fixed_amount') && data.discountType !== 'free_delivery' && (!data.discountValue || data.discountValue <= 0)) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ['discountValue'],
			message: 'A positive discount value is required for this discount method.',
		});
	}
});
