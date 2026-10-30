import 'server-only';
import type {QuoteTrace} from './diagnostic-schema';
import type {AuthoritativeDraft} from './customer-boundary';
import type {ManagedDeliveryRuntime} from './runtime';
type Scope={brandId:string;locationId:string};
export type ApprovedManagedRuntimeConfig={scope:Scope;environment:'sandbox'|'production';routingSource:string;routingApprovalRef:string;retentionApprovalRef:string;pickupContact:{name:string;phone:string;verifiedAt:string}};
export type ManagedRuntimeDependencies={
 dispatchEnabled:()=>boolean;
 environment:()=>Record<string,string|undefined>;
 loadConfig:(scope:Scope)=>Promise<ApprovedManagedRuntimeConfig|null>;
 authorizeConfig?:(config:ApprovedManagedRuntimeConfig)=>Promise<boolean>;
 hasApprovedRoutingSource:(source:string)=>boolean|Promise<boolean>;
 createRouting:(config:ApprovedManagedRuntimeConfig)=>Promise<ManagedDeliveryRuntime['routing']|null>;
 createQuoteProvider:(config:ApprovedManagedRuntimeConfig,draft:AuthoritativeDraft)=>Promise<ManagedDeliveryRuntime['provider']|null>;
};
/** Dependencies belong to the server composition root. Nothing supplied in a customer request registers an adapter or grants approval. */
export function createConfiguredManagedDeliveryRuntimeResolver(deps:ManagedRuntimeDependencies){
 async function config(scope:Scope){
  const c=await deps.loadConfig(scope);
  if(!c||c.scope.brandId!==scope.brandId||c.scope.locationId!==scope.locationId||!['sandbox','production'].includes(c.environment)||!c.routingApprovalRef.trim()||!c.retentionApprovalRef.trim()||!await deps.hasApprovedRoutingSource(c.routingSource))return null;
  if(deps.authorizeConfig){if(!await deps.authorizeConfig(c))return null;}
  else {
   const env=deps.environment();
   if(!deps.dispatchEnabled()||env.ORDERFLY_DELIVERY_CHECKOUT_ENABLED!=='true'||env.ORDERFLY_DELIVERY_ROUTING_ENABLED!=='true'||c.environment!==env.ORDERFLY_DELIVERY_ENVIRONMENT)return null;
   if(c.environment==='production'&&env.ORDERFLY_DELIVERY_PRODUCTION_ENABLED!=='true')return null;
  }
  if(!c.pickupContact.name.trim()||!/^\+[1-9]\d{7,14}$/.test(c.pickupContact.phone)||!Number.isFinite(Date.parse(c.pickupContact.verifiedAt)))return null;
  return c;
 }
 return {
  async available(scope:Scope){try{return !!await config(scope);}catch{return false;}},
  async resolve(scope:Scope,draft:AuthoritativeDraft,expectedEnvironment?:'sandbox'|'production',trace:QuoteTrace=()=>{}):Promise<ManagedDeliveryRuntime|null>{
   try{const c=await config(scope);if(!c||expectedEnvironment!==undefined&&c.environment!==expectedEnvironment||draft.binding.brandId!==scope.brandId||draft.binding.locationId!==scope.locationId)return null;
    // Independent server-side initialization. Neither constructor requests a
    // route or a courier quote; both must succeed before any external quoting.
    const [routingResult,providerResult]=await Promise.allSettled([deps.createRouting(c),deps.createQuoteProvider(c,draft)]);
    if(routingResult.status==='rejected')throw routingResult.reason;
    if(providerResult.status==='rejected')throw providerResult.reason;
    const routing=routingResult.value,provider=providerResult.value;
    if(!routing||routing.source!==c.routingSource){trace('runtime','routing_adapter_unavailable');return null;}
    if(!provider||provider.providerId!==draft.binding.providerId){trace('runtime','provider_adapter_unavailable');return null;}
    return {routing,provider,pickupContact:{name:c.pickupContact.name,phone:c.pickupContact.phone}};
   }catch(error){trace('runtime',error);return null;}
  }
 };
}
