import 'server-only';
import type {AuthoritativeDraft} from './customer-boundary';
import type {ManagedDeliveryRuntime} from './runtime';
type Scope={brandId:string;locationId:string};
export type ApprovedManagedRuntimeConfig={scope:Scope;environment:'sandbox'|'production';routingSource:string;routingApprovalRef:string;retentionApprovalRef:string;pickupContact:{name:string;phone:string;verifiedAt:string}};
export type ManagedRuntimeDependencies={
 dispatchEnabled:()=>boolean;
 environment:()=>Record<string,string|undefined>;
 loadConfig:(scope:Scope)=>Promise<ApprovedManagedRuntimeConfig|null>;
 hasApprovedRoutingSource:(source:string)=>boolean;
 createRouting:(config:ApprovedManagedRuntimeConfig)=>Promise<ManagedDeliveryRuntime['routing']|null>;
 createQuoteProvider:(config:ApprovedManagedRuntimeConfig,draft:AuthoritativeDraft)=>Promise<ManagedDeliveryRuntime['provider']|null>;
};
/** Dependencies belong to the server composition root. Nothing supplied in a customer request registers an adapter or grants approval. */
export function createConfiguredManagedDeliveryRuntimeResolver(deps:ManagedRuntimeDependencies){
 async function config(scope:Scope){
  const env=deps.environment();
  if(!deps.dispatchEnabled()||env.ORDERFLY_DELIVERY_CHECKOUT_ENABLED!=='true'||env.ORDERFLY_DELIVERY_ROUTING_ENABLED!=='true')return null;
  const environment=env.ORDERFLY_DELIVERY_ENVIRONMENT;
  if(environment!=='sandbox'&&environment!=='production')return null;
  if(environment==='production'&&env.ORDERFLY_DELIVERY_PRODUCTION_ENABLED!=='true')return null;
  const c=await deps.loadConfig(scope);
  if(!c||c.scope.brandId!==scope.brandId||c.scope.locationId!==scope.locationId||c.environment!==environment||!c.routingApprovalRef.trim()||!c.retentionApprovalRef.trim()||!deps.hasApprovedRoutingSource(c.routingSource))return null;
  if(!c.pickupContact.name.trim()||!/^\+[1-9]\d{7,14}$/.test(c.pickupContact.phone)||!Number.isFinite(Date.parse(c.pickupContact.verifiedAt)))return null;
  return c;
 }
 return {
  async available(scope:Scope){try{return !!await config(scope);}catch{return false;}},
  async resolve(scope:Scope,draft:AuthoritativeDraft):Promise<ManagedDeliveryRuntime|null>{
   try{const c=await config(scope);if(!c||draft.binding.brandId!==scope.brandId||draft.binding.locationId!==scope.locationId)return null;
    const routing=await deps.createRouting(c);if(!routing||routing.source!==c.routingSource)return null;
    const provider=await deps.createQuoteProvider(c,draft);if(!provider||provider.providerId!==draft.binding.providerId)return null;
    return {routing,provider,pickupContact:{name:c.pickupContact.name,phone:c.pickupContact.phone}};
   }catch{return null;}
  }
 };
}
