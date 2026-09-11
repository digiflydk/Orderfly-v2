import { z } from 'zod';
import { MAX_TOPPINGS_PER_ITEM } from './commerce-limits';
const amount = z.number().finite().nonnegative();
const id = z.string().min(1).max(160).regex(/^[^/\\?#]+$/);
const optionalText = z.string().max(250).nullish().transform(value => value ?? undefined);
const attributionText = z.string().max(256).regex(/^[\p{L}\p{N} _.,:+\-/]+$/u).optional();
const analyticsAttribution = z.object({
  source: attributionText, medium: attributionText, campaign: attributionText, campaignId: attributionText,
  term: attributionText, content: attributionText, gclid: attributionText, gbraid: attributionText,
  wbraid: attributionText, fbclid: attributionText,
  landingPath: z.string().max(500).regex(/^\/[^?#]*$/).optional(),
  referrerHost: z.string().max(253).regex(/^[a-z0-9.-]+$/).optional(),
}).strict().optional();
const customer = z.object({
  analyticsSessionId: z.string().uuid().optional(), analyticsDevice: z.enum(['mobile','desktop']).optional(), analyticsConsent: z.boolean().optional(), analyticsAttribution,
  name: z.string().trim().min(2).max(200), email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(50), street: optionalText, zipCode: optionalText, city: optionalText,
  newsletterConsentId: z.string().uuid().optional(),
  newsletterConsentVersion: z.literal('checkout-email-da-2026-09-08').optional(),
  subscribeToNewsletter: z.boolean(), acceptTerms: z.literal(true),
}).superRefine((value, context) => {
  if (!!value.newsletterConsentId !== !!value.newsletterConsentVersion) {
    context.addIssue({ code: 'custom', message: 'Newsletter consent ID and version must be supplied together' });
  }
});
export const checkoutRequestSchema = z.tuple([
  z.array(z.object({ id, name: z.string().min(1).max(200), quantity: z.number().int().min(1).max(999),
    itemType: z.enum(['product', 'combo']).optional(),
    toppingIds: z.array(id).max(MAX_TOPPINGS_PER_ITEM).optional(),
    comboSelections: z.array(z.object({ groupId: id.optional(), groupName: z.string().min(1).max(200),
      products: z.array(z.object({ id, name: z.string().max(200) })).max(40),
    })).max(20).optional(),
    unitPrice: amount, totalPrice: amount, toppings: z.array(z.string().max(200)).max(MAX_TOPPINGS_PER_ITEM).optional(),
  })).min(1).max(97), // Stripe supports 100 lines, leaving room for the three fees.
  customer, z.enum(['pickup', 'delivery']), id, id,
  z.object({ subtotal: amount, deliveryFee: amount, bagFee: amount.optional(), adminFee: amount.optional(),
    vatAmount: amount.optional(), discountTotal: amount, itemDiscountTotal: amount.optional(),
    cartDiscountTotal: amount.optional(), cartDiscountName: z.string().max(250).optional(), tips: amount, taxes: amount,
  }),
  id.nullable(), id, id, optionalText, id.nullish().transform(value => value ?? undefined),
]).refine(args => args[2] !== 'delivery' || !!(args[1].street?.trim() && args[1].zipCode?.trim() && args[1].city?.trim()), 'Delivery address required');
