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
const customerBase = z.object({
  deliveryInstructions: z.string().regex(/^[^\p{Cf}\p{Cs}\u0000-\u0008\u000b-\u001f\u007f]*$/u, 'Delivery instructions contain unsupported control characters').trim().max(400).optional(),
  paymentMethod: z.enum(['online', 'pay_at_pickup']).optional(),
  analyticsSessionId: z.string().uuid().optional(), analyticsDevice: z.enum(['mobile','desktop']).optional(), analyticsConsent: z.boolean().optional(), analyticsAttribution,
  name: z.string().trim().min(2).max(200), email: z.string().trim().email().max(254),
  phone: z.string().trim().min(5).max(50), street: optionalText, zipCode: optionalText, city: optionalText,
  newsletterConsentId: z.string().uuid().optional(),
  newsletterConsentVersion: z.enum(['checkout-email-da-2026-09-08', 'checkout-email-da-2026-09-28']).optional(),
  subscribeToNewsletter: z.boolean(), subscribeToClub: z.boolean().optional(), clubTermsAccepted: z.boolean().optional(),
  clubConsentVersion: z.string().max(64).optional(), clubTermsVersion: z.string().max(64).optional(), clubCampaignVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  acceptTerms: z.literal(true),
});
const customer = customerBase.superRefine((value, context) => {
  if (value.subscribeToClub && (!value.subscribeToNewsletter || value.clubTermsAccepted !== true || !value.clubConsentVersion || !value.clubTermsVersion)) context.addIssue({code:'custom',message:'Club signup requires explicit newsletter and terms acceptance with the shown versions'});
  if (!!value.newsletterConsentId !== !!value.newsletterConsentVersion) {
    context.addIssue({ code: 'custom', message: 'Newsletter consent ID and version must be supplied together' });
  }
});
const checkoutTupleSchema = z.tuple([
  z.array(z.object({ id, upsellId: id.optional(), name: z.string().min(1).max(200), quantity: z.number().int().min(1).max(999),
    itemType: z.enum(['product', 'combo']).optional(),
    toppingIds: z.array(id).max(MAX_TOPPINGS_PER_ITEM).optional(),
    toppingQuantities: z.array(z.number().int().min(1).max(MAX_TOPPINGS_PER_ITEM)).max(MAX_TOPPINGS_PER_ITEM).optional(),
    comboSelections: z.array(z.object({ groupId: id.optional(), groupName: z.string().min(1).max(200),
      products: z.array(z.object({ id, name: z.string().max(200) , modifiers: z.array(z.object({ id, quantity: z.number().int().min(1).max(MAX_TOPPINGS_PER_ITEM) }).strict()).max(MAX_TOPPINGS_PER_ITEM).optional() })).max(40),
    })).max(20).optional(),
    unitPrice: amount, totalPrice: amount, toppings: z.array(z.string().max(200)).max(MAX_TOPPINGS_PER_ITEM).optional(),
  }).refine(item => !item.toppingQuantities || (!!item.toppingIds && item.toppingIds.length === item.toppingQuantities.length && item.toppingIds.length === (item.toppings || []).length && item.toppingQuantities.reduce((sum, n) => sum + n, 0) <= MAX_TOPPINGS_PER_ITEM), 'Invalid topping quantities.')).min(1).max(97), // Stripe supports 100 lines, leaving room for the three fees.
  customer, z.enum(['pickup', 'delivery']), id, id,
  z.object({ subtotal: amount, deliveryFee: amount, bagFee: amount.optional(), adminFee: amount.optional(),
    vatAmount: amount.optional(), discountTotal: amount, itemDiscountTotal: amount.optional(),
    cartDiscountTotal: amount.optional(), cartDiscountName: z.string().max(250).optional(), tips: amount, taxes: amount,
  }),
  id.nullable(), id, id, optionalText, id.nullish().transform(value => value ?? undefined),
]);
export const checkoutRequestSchema = checkoutTupleSchema.refine(args => args[2] !== 'delivery' || !!(args[1].street?.trim() && args[1].zipCode?.trim() && args[1].city?.trim()), 'Delivery address required');

// Quote validation never records or fabricates acceptance of purchase or marketing terms.
const quoteCustomer = customerBase.extend({acceptTerms:z.boolean()});
const [items,,method,brandId,locationId,payment,discount,brandSlug,locationSlug,time,consent]=checkoutTupleSchema.items;
export const deliveryQuoteRequestSchema = z.tuple([items,quoteCustomer,method,brandId,locationId,payment,discount,brandSlug,locationSlug,time,consent])
  .refine(args=>args[2]==='delivery'&&!!(args[1].street?.trim()&&args[1].zipCode?.trim()&&args[1].city?.trim()),'Delivery address required');
export const managedDeliveryAcceptanceSchema=z.object({checkoutKey:z.string().regex(/^[a-f0-9]{64}$/),quoteId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),quoteToken:z.string().regex(/^[a-f0-9]{64}$/),checkoutFingerprint:z.string().regex(/^[a-f0-9]{64}$/),customerFeeMinor:z.number().int().nonnegative().safe(),checkoutTotalMinor:z.number().int().positive().safe(),currency:z.literal('DKK')}).strict();

// The HTTP transport must retain the twelfth, server-verified delivery proof.
export const checkoutSessionRequestSchema=z.union([checkoutRequestSchema,
  z.tuple([...checkoutTupleSchema.items,managedDeliveryAcceptanceSchema])
    .refine(args=>args[2]==='delivery'&&!!(args[1].street?.trim()&&args[1].zipCode?.trim()&&args[1].city?.trim()),'Managed delivery address required')]);
