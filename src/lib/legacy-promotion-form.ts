import type { Discount, StandardDiscount } from '@/types';

// Older campaigns predate some form fields. Use the same unrestricted meaning
// as the checkout evaluator for absent day/time limits and keep stored values.
export function discountFormRecord(discount: Discount): Discount {
  const legacy = discount as Discount & { locationId?: string; applicationType?: string };
  return {
    ...discount,
    locationIds: Array.isArray(discount.locationIds) ? discount.locationIds : legacy.locationId ? [legacy.locationId] : [],
    applicationType: legacy.applicationType ?? (discount.code === 'NEWSLETTER_SIGNUP' ? 'newsletter_signup' : 'code'),
    orderTypes: Array.isArray(discount.orderTypes) ? discount.orderTypes : ['pickup', 'delivery'],
    activeDays: Array.isArray(discount.activeDays) ? discount.activeDays : [],
    activeTimeSlots: Array.isArray(discount.activeTimeSlots) ? discount.activeTimeSlots : [],
    usageLimit: discount.usageLimit ?? 0,
    perCustomerLimit: discount.perCustomerLimit ?? 0,
    firstTimeCustomerOnly: discount.firstTimeCustomerOnly ?? false,
    allowStacking: discount.allowStacking ?? false,
  } as Discount;
}

export function standardDiscountFormRecord(discount: StandardDiscount): StandardDiscount {
  const legacy = discount as StandardDiscount & { locationId?: string; referenceId?: string };
  return {
    ...discount,
    locationIds: Array.isArray(discount.locationIds) ? discount.locationIds : legacy.locationId ? [legacy.locationId] : [],
    referenceIds: Array.isArray(discount.referenceIds) && discount.referenceIds.length > 0 ? discount.referenceIds : legacy.referenceId ? [legacy.referenceId] : [],
    orderTypes: Array.isArray(discount.orderTypes) ? discount.orderTypes : ['pickup', 'delivery'],
    activeDays: Array.isArray(discount.activeDays) ? discount.activeDays : [],
    activeTimeSlots: Array.isArray(discount.activeTimeSlots) ? discount.activeTimeSlots : [],
    timeSlotValidationType: discount.timeSlotValidationType ?? 'orderTime',
    allowStacking: discount.allowStacking ?? false,
    assignToOfferCategory: discount.assignToOfferCategory ?? false,
  };
}
