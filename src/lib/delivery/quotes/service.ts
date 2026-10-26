import type {DeliveryCampaignSnapshot} from './schema';
import { deliveryQuoteRequestSchema, deliveryQuoteResultSchema, type DeliveryQuoteRequest, type DeliveryProvider } from '../provider-contract';
import { deliverySettingsSchema, type DeliverySettings } from '../settings/schema';
import { deliveryScheduleAt } from '../settings/schedule';
import { resolveDeliveryRoute, type RoutingAdapter, type RouteEvidence } from '../routing/service';
import { checkDeliveryCoverage } from '../coverage/check';
import { buildQuote, quoteFingerprint, type QuoteBindingInput, type BoundQuote } from './binding';

type AddressInput = Omit<DeliveryQuoteRequest['pickup'], 'coordinates'>;
type FulfillmentInput = Omit<DeliveryQuoteRequest, 'pickup' | 'dropoff'> & {pickup:AddressInput;dropoff:AddressInput};
export type DeliveryQuoteServiceInput = {
  appliedCampaign?:DeliveryCampaignSnapshot; settings: DeliverySettings; binding: QuoteBindingInput; fulfillment: FulfillmentInput;
  quoteRef: string; itemSubtotalAfterDiscountMinor: number; freshnessMs: number; maxRouteAgeMs: number; routeProfile: string;
};
export function quoteAddressBinding(pickup:AddressInput,dropoff:AddressInput):string {
  const fields=(a:AddressInput)=>[a.country,a.postcode,a.city,a.street,a.building,a.unit];
  return JSON.stringify([fields(pickup),fields(dropoff)]);
}
export type QuoteServiceResult = {ok:true;quote:BoundQuote} | {ok:false;reason:string};
/** Internal composition only: authenticate scope/load settings and cart before calling. No public DTO is authoritative. */
export async function quoteDelivery(input:DeliveryQuoteServiceInput, deps:{
  routing:RoutingAdapter|null;provider:DeliveryProvider|null;now:()=>Date;
  areaAllows:(route:RouteEvidence)=>boolean;
}):Promise<QuoteServiceResult> {
  try {
    const settings=deliverySettingsSchema.parse(input.settings);
    quoteFingerprint(input.binding);
    if (!settings.pricingRules || !settings.providerId || !deps.provider) return {ok:false,reason:'provider_unconfigured'};
    if (settings.providerId!==input.binding.providerId || deps.provider.providerId!==settings.providerId) return {ok:false,reason:'provider_mismatch'};
    if (!Number.isSafeInteger(input.itemSubtotalAfterDiscountMinor)||input.itemSubtotalAfterDiscountMinor<0) return {ok:false,reason:'invalid_input'};
    if (input.fulfillment.scope.brandId!==input.binding.brandId || input.fulfillment.scope.locationId!==input.binding.locationId
      || input.fulfillment.checkoutRef!==input.binding.checkoutReference || input.fulfillment.providerId!==settings.providerId
      || input.fulfillment.readyAt!==input.binding.fulfillmentAt
      || input.binding.normalizedAddress!==quoteAddressBinding(input.fulfillment.pickup,input.fulfillment.dropoff)) return {ok:false,reason:'scope_mismatch'};
    // Scheduled coverage belongs to the requested delivery window; kitchen readiness is a separate native constraint.
    const deliveryAt=input.fulfillment.desiredDelivery.kind==='scheduled'?input.fulfillment.desiredDelivery.interval.earliest:input.binding.fulfillmentAt;
    const schedule=deliveryScheduleAt(settings,new Date(deliveryAt));
    if (!schedule.open) return {ok:false,reason:schedule.reason};
    const postal=(a:AddressInput)=>({street:`${a.street} ${a.building}`.trim(),postalCode:a.postcode,city:a.city,countryCode:a.country});
    const routeResult=await resolveDeliveryRoute({pickup:postal(input.fulfillment.pickup),dropoff:postal(input.fulfillment.dropoff),profile:input.routeProfile},{adapter:deps.routing,now:deps.now});
    if (!routeResult.ok) return routeResult;
    const {route,pickup,dropoff}=routeResult;
    const coordinates=(a:typeof pickup)=>({latitude:a.latitude,longitude:a.longitude,source:route.source});
    const fulfillment=deliveryQuoteRequestSchema.parse({...input.fulfillment,
      pickup:{...input.fulfillment.pickup,coordinates:coordinates(pickup)},dropoff:{...input.fulfillment.dropoff,coordinates:coordinates(dropoff)}});
    if (fulfillment.scope.brandId!==input.binding.brandId || fulfillment.scope.locationId!==input.binding.locationId
      || fulfillment.checkoutRef!==input.binding.checkoutReference || fulfillment.providerId!==settings.providerId) return {ok:false,reason:'scope_mismatch'};
    if(fulfillment.desiredDelivery.kind==='scheduled'){
      const target=Date.parse(fulfillment.desiredDelivery.interval.earliest);
      if(target!==Date.parse(fulfillment.desiredDelivery.interval.latest)||target<Date.parse(fulfillment.readyAt)+route.durationSeconds*1000)return {ok:false,reason:'unsupported_schedule'};
      const targetSchedule=deliveryScheduleAt(settings,new Date(target));
      if(!targetSchedule.open)return {ok:false,reason:targetSchedule.reason};
    }
    const areaAllowed=deps.areaAllows(route);
    const initialCoverage=checkDeliveryCoverage({settings,schedule,route,areaAllowed,providerAvailable:true,nowMs:deps.now().getTime(),maxRouteAgeMs:input.maxRouteAgeMs});
    if (!initialCoverage.eligible) return {ok:false,reason:initialCoverage.reason};
    const providerQuote=deliveryQuoteResultSchema.parse(await deps.provider.quote(fulfillment));
    if (providerQuote.kind==='error') return {ok:false,reason:'provider_error'};
    if (providerQuote.kind==='unavailable') return {ok:false,reason:`provider_${providerQuote.reason}`};
    if (providerQuote.providerId!==settings.providerId) return {ok:false,reason:'provider_mismatch'};
    if (providerQuote.cost.taxBasis==='unknown') return {ok:false,reason:'incompatible_money'};
    // Cost is the adapter's total payable quote; surcharges are informational breakdown, not added twice.
    const nowMs=deps.now().getTime();
    const coverage=checkDeliveryCoverage({settings,schedule,route,areaAllowed,providerAvailable:true,nowMs,maxRouteAgeMs:input.maxRouteAgeMs});
    if (!coverage.eligible) return {ok:false,reason:coverage.reason};
    const result=buildQuote({fulfillment,providerQuote,...(input.appliedCampaign?{appliedCampaign:input.appliedCampaign}:{}),binding:input.binding,quoteRef:input.quoteRef,providerQuoteRef:providerQuote.quoteRef,nowMs,
      freshnessMs:input.freshnessMs,providerExpiresAtMs:providerQuote.expiresAt===null?null:Date.parse(providerQuote.expiresAt),
      price:{rules:settings.pricingRules,route:{meters:route.meters,method:route.method,source:route.source,profile:route.profile,calculatedAt:route.calculatedAt},itemSubtotalAfterDiscountMinor:input.itemSubtotalAfterDiscountMinor,
        providerCost:{amountMinor:providerQuote.cost.amountMinor,currency:providerQuote.cost.currency,taxBasis:providerQuote.cost.taxBasis}}});
    return result;
  } catch {return {ok:false,reason:'quote_unavailable'};}
}
