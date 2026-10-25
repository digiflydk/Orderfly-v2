import { z } from 'zod';
import { deliveryIdSchema, deliveryQuoteRequestSchema, deliveryQuoteResultSchema, routeDistanceSchema } from '../provider-contract';
import { deliveryPricingRulesSchema } from '../settings/pricing-schema';
import { calculateDeliveryPrice } from '../pricing/calculate';
const integer=z.number().int().nonnegative().safe();
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const money=z.object({amountMinor:integer,currency:z.string().regex(/^[A-Z]{3}$/),taxBasis:z.enum(['inclusive','exclusive'])}).strict();
export const storedDeliveryQuoteSchema=z.object({
  version:z.literal(1),quoteRef:deliveryIdSchema,providerQuoteRef:z.string().min(1).max(300),
  binding:z.object({brandId:deliveryIdSchema,locationId:deliveryIdSchema,checkoutReference:deliveryIdSchema,providerId:deliveryIdSchema,
    normalizedAddress:z.string().trim().min(1).max(1000),cartDigest:digest,fulfillmentAt:z.string().datetime({offset:true}),brandRevision:integer,locationRevision:integer}).strict(),
  fingerprint:digest,createdAtMs:integer,expiresAtMs:integer,
  fulfillment:deliveryQuoteRequestSchema,
  providerQuote:deliveryQuoteResultSchema.options[0],
  economics:z.object({rules:deliveryPricingRulesSchema,route:routeDistanceSchema.refine(v=>v.method==='route'),itemSubtotalAfterDiscountMinor:integer,
    localCostEstimate:money.nullable(),providerQuoteCost:money,customerFee:money,subsidy:money,actualBilledCost:z.null(),freeDeliveryApplied:z.boolean()}).strict(),
}).strict().superRefine((v,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
  if(v.expiresAtMs<=v.createdAtMs||v.expiresAtMs-v.createdAtMs>300000)fail('Invalid quote lifetime');
  if(v.providerQuote.expiresAt!==null&&v.expiresAtMs>Date.parse(v.providerQuote.expiresAt))fail('Quote exceeds provider expiry');
  if(v.binding.brandId!==v.fulfillment.scope.brandId||v.binding.locationId!==v.fulfillment.scope.locationId||v.binding.checkoutReference!==v.fulfillment.checkoutRef||v.binding.providerId!==v.fulfillment.providerId||v.binding.providerId!==v.providerQuote.providerId||v.providerQuoteRef!==v.providerQuote.quoteRef)fail('Quote scope/reference mismatch');
  const cost=v.economics.providerQuoteCost;
  if(cost.amountMinor!==v.providerQuote.cost.amountMinor||cost.currency!==v.providerQuote.cost.currency||cost.taxBasis!==v.providerQuote.cost.taxBasis)fail('Provider cost mismatch');
  if(v.economics.route.method!=='route')return;
  const expected=calculateDeliveryPrice({rules:v.economics.rules,route:{...v.economics.route,method:'route'},itemSubtotalAfterDiscountMinor:v.economics.itemSubtotalAfterDiscountMinor,providerCost:cost});
  if(!expected.ok){fail('Invalid quote economics');return;}
  for(const key of ['customerFee','subsidy','localCostEstimate'] as const){
    const a=v.economics[key],b=expected.snapshot[key];
    if(a===null||b===null){if(a!==b)fail('Economics mismatch');}
    else if(a.amountMinor!==b.amountMinor||a.currency!==b.currency||a.taxBasis!==b.taxBasis)fail('Economics mismatch');
  }
  if(v.economics.freeDeliveryApplied!==expected.snapshot.freeDeliveryApplied)fail('Free delivery mismatch');
});
/** Persist create-only; schema validation alone does not establish trusted provenance. */
export type StoredDeliveryQuote=z.infer<typeof storedDeliveryQuoteSchema>;
