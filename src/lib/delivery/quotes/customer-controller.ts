import {deliveryPreparationMinutes,deliveryKitchenOpenAt,resolveDeliveryKitchenReadyTime} from '@/lib/fulfillment-time';
import {deliveryScheduleAt} from '../settings/schedule';
import {normalizeDeliveryPhone} from './phone';
import type {QuoteTrace} from './diagnostic-schema';
import {customerQuoteFailure} from './customer-failure';
import 'server-only';
import {randomBytes} from 'node:crypto';
import {getAdminDb} from '@/lib/firebase-admin';
import {ore} from '@/lib/money';
import type {Brand,Location,CustomerInfo,MinimalCartItem,PaymentDetails} from '@/types';
import {loadDeliverySettingsInTransaction} from '../settings/server';
import {quoteContentDigest} from './digest';
import {quoteDelivery,quoteAddressBinding} from './service';
import {normalizeDanishDeliveryAddress} from './address';
import {checkoutKeyHash,issueCustomerQuote,type AuthoritativeDraft} from './customer-boundary';
import {persistCustomerQuoteClaim,reserveCustomerQuoteRate,saveAuthoritativeCustomerDraft,loadCurrentCustomerDraft} from './customer-store';
import {resolveManagedDeliveryRuntime,managedDeliveryRuntimeAvailable,managedDeliveryRuntimeEnvironment} from './runtime';
export type NativeManagedPricing={brand:Brand;location:Location;customer:CustomerInfo;cartItems:MinimalCartItem[];payment:Omit<PaymentDetails,'paymentRefId'>;subtotalAfterDiscount:number;checkoutKey:string;deliverySelection:string|null;freeDeliveryCampaignIds:string[]};
export async function prepareNativeManagedDraft(input:NativeManagedPricing,preservedReadyAt?:string,expectedEnvironment?:'sandbox'|'production'){
 const {brand,location,customer}=input;if(location.brandId!==brand.id||!location.isActive||!location.deliveryTypes.includes('delivery')||brand.currency.toUpperCase()!=='DKK')throw Error('delivery_scope_invalid');
 const result=await getAdminDb().runTransaction(async tx=>(await loadDeliverySettingsInTransaction(tx,brand.id,location.id)).result);
 if(!result.settings.enabled||result.settings.paused||!result.settings.providerId)throw Error('delivery_disabled');
 const now=new Date(),scheduled=!!input.deliverySelection&&input.deliverySelection!=='asap';
 if(!scheduled&&(!deliveryKitchenOpenAt(location,now)||!deliveryScheduleAt(result.settings,now).open))throw Error('delivery_kitchen_closed');
 const preparationMinutes=deliveryPreparationMinutes(location,result.settings.preparationMinutes);
 const readyAt=preservedReadyAt??resolveDeliveryKitchenReadyTime(location,now,result.settings.preparationMinutes);
 const pickup=normalizeDanishDeliveryAddress({street:location.street,postcode:location.zipCode,city:location.city,country:location.country});
 const dropoff=normalizeDanishDeliveryAddress({street:customer.street||'',postcode:customer.zipCode||'',city:customer.city||'',country:location.country});
 const key=checkoutKeyHash(input.checkoutKey);
 const runtimeEnvironment=await managedDeliveryRuntimeEnvironment({brandId:brand.id,locationId:location.id});
 if(!runtimeEnvironment)throw Error('delivery_environment_unconfigured');
 if(expectedEnvironment!==undefined&&runtimeEnvironment!==expectedEnvironment)throw Error('delivery_environment_changed');
 const cartDigest=quoteContentDigest(JSON.parse(JSON.stringify({runtimeEnvironment,preparationMinutes,kitchenHours:location.openingHours,items:input.cartItems,itemSubtotalAfterDiscountMinor:ore(input.subtotalAfterDiscount),
   bagFeeMinor:ore(input.payment.bagFee||0),adminFeeMinor:ore(input.payment.adminFee||0),discount:input.payment.cartDiscountTotal||0,
   customer:{name:customer.name,email:customer.email.trim().toLowerCase(),phone:normalizeDeliveryPhone(customer.phone),deliveryInstructions:customer.deliveryInstructions||'',subscribeToNewsletter:customer.subscribeToNewsletter,subscribeToClub:!!customer.subscribeToClub},selection:input.deliverySelection,freeDeliveryCampaignIds:input.freeDeliveryCampaignIds})));
 const binding={brandId:brand.id,locationId:location.id,checkoutReference:key,providerId:result.settings.providerId,
  normalizedAddress:quoteAddressBinding(pickup,dropoff),cartDigest,fulfillmentAt:readyAt,brandRevision:result.brandRevision,locationRevision:result.revision};
 const draft={checkoutKeyHash:key,binding,requestDigest:quoteContentDigest({binding}),itemSubtotalAfterDiscountMinor:ore(input.subtotalAfterDiscount),bagFeeMinor:ore(input.payment.bagFee||0),adminFeeMinor:ore(input.payment.adminFee||0)};
 const settings=structuredClone(result.settings);

 return {draft,settings,pickup,dropoff,preparationMinutes,runtimeEnvironment};
}
export async function createNativeManagedCustomerQuote(input:NativeManagedPricing,trace:QuoteTrace=()=>{}){
 const scope={brandId:input.brand.id,locationId:input.location.id};
 if(!await managedDeliveryRuntimeAvailable(scope))return {ok:false as const,code:'delivery_unavailable' as const,message:'Levering er ikke tilgængelig lige nu. Vælg afhentning.'};
 trace('draft');
 const native=await prepareNativeManagedDraft(input),draft=await saveAuthoritativeCustomerDraft(native.draft);
 trace('runtime');
 const runtime=await resolveManagedDeliveryRuntime(scope,draft,native.runtimeEnvironment,trace);
 if(!runtime)return {ok:false as const,code:'delivery_unavailable' as const,message:'Levering er ikke tilgængelig lige nu. Vælg afhentning.'};
 let boundaryStage:'quote'|'claim'='quote';
 // Global aggregate budget is deliberately conservative until trusted edge identity is configured; never trust client IP headers.
 return issueCustomerQuote(draft,{reserveRate:()=>reserveCustomerQuoteRate(draft.checkoutKeyHash,quoteContentDigest({scope:'managed-delivery-global'})),now:()=>Date.now(),commitIfCurrent:async claim=>{boundaryStage='claim';trace('claim');return persistCustomerQuoteClaim(claim);},onFailure:error=>trace(boundaryStage,error),createQuote:async()=>{
  trace('quote');
  const result=await quoteDelivery({...(input.freeDeliveryCampaignIds.length&&native.settings.pricingRules?{appliedCampaign:{kind:'native_free_delivery' as const,campaignIds:input.freeDeliveryCampaignIds,maxDistanceMeters:Math.min(native.settings.maxDistanceMeters,native.settings.pricingRules.maxDistanceMeters)}}:{}),settings:native.settings,binding:draft.binding,quoteRef:randomBytes(16).toString('hex'),itemSubtotalAfterDiscountMinor:draft.itemSubtotalAfterDiscountMinor,
   freshnessMs:300000,maxRouteAgeMs:60000,routeProfile:'car',fulfillment:{version:1,scope:{brandId:input.brand.id,locationId:input.location.id},checkoutRef:draft.binding.checkoutReference,providerId:draft.binding.providerId,
    pickup:native.pickup,dropoff:native.dropoff,pickupContact:runtime.pickupContact,dropoffContact:{name:input.customer.name,phone:normalizeDeliveryPhone(input.customer.phone)},instructions:input.customer.deliveryInstructions||'',readyAt:draft.binding.fulfillmentAt,
    ...(input.deliverySelection&&input.deliverySelection!=='asap'?{preparationMinutes:native.preparationMinutes}:{}),
    desiredDelivery:input.deliverySelection&&input.deliverySelection!=='asap'?{kind:'scheduled',interval:{earliest:input.deliverySelection,latest:input.deliverySelection}}:{kind:'asap'},items:input.cartItems.map(item=>({name:item.name,quantity:item.quantity})),bagCount:null,requirements:[]}},
   {routing:runtime.routing,provider:runtime.provider,now:()=>new Date(),areaAllows:()=>true});
  if(!result.ok){trace('quote',result.diagnostic??result.reason);return customerQuoteFailure(result.reason);}
  if(result.quote.providerQuote.expiresAt===null)trace('quote','quote_missing_expiry');
  return result.quote.providerQuote.expiresAt!==null?result.quote:null;
 }});
}
export async function currentNativeManagedDraft(input:NativeManagedPricing,expectedEnvironment?:'sandbox'|'production'):Promise<AuthoritativeDraft>{
 const saved=await loadCurrentCustomerDraft(checkoutKeyHash(input.checkoutKey));
 const current=await prepareNativeManagedDraft(input,saved.binding.fulfillmentAt,expectedEnvironment);
 if(current.draft.requestDigest!==saved.requestDigest)throw Error('quote_draft_changed');
 return {...current.draft,draftRevision:saved.draftRevision,addressRevision:saved.addressRevision};
}
