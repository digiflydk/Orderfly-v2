import 'server-only';
import {readManagedDeliveryAdoption} from './adoption';
import {createHash} from 'node:crypto';
import {getAdminDb} from '@/lib/firebase-admin';
import {deliveryDispatchEnabled} from '../settings/server';
import {createGoogleRoutingAdapter} from '../routing/google/adapter';
import {createGeoapifyRoutingAdapter} from '../routing/geoapify/adapter';
import {createGeoapifyBudget,isGeoapifyQuotaNamespace} from '../routing/geoapify/budget';
import type {RoutingAdapter} from '../routing/service';
import type {DeliveryProvider} from '../provider-contract';
import type {AuthoritativeDraft} from './customer-boundary';
import {createConfiguredManagedDeliveryRuntimeResolver,type ApprovedManagedRuntimeConfig} from './runtime-configured';
export type ManagedDeliveryRuntime={routing:RoutingAdapter;provider:DeliveryProvider;pickupContact:{name:string;phone:string}};
function geoapifyConfigured(){
 const key=process.env.ORDERFLY_DELIVERY_GEOAPIFY_API_KEY;
 const namespace=process.env.ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE;
 return process.env.ORDERFLY_DELIVERY_ENVIRONMENT==='sandbox'
  &&process.env.ORDERFLY_DELIVERY_GEOAPIFY_ENABLED==='true'
  &&process.env.ORDERFLY_DELIVERY_GEOAPIFY_RETENTION_APPROVED==='true'
  &&typeof key==='string'&&key.length>0&&key.length<=300&&!/[\s\p{Cc}\p{Cf}]/u.test(key)
  &&isGeoapifyQuotaNamespace(namespace);
}
const resolver=createConfiguredManagedDeliveryRuntimeResolver({
 dispatchEnabled:deliveryDispatchEnabled,environment:()=>process.env,
 async loadConfig(scope){
  if(await readManagedDeliveryAdoption(scope)!=='managed')return null;
  const key=createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId])).digest('hex');
  const snapshot=await getAdminDb().collection('deliveryRuntimeConfigs').doc(key).get();
  return snapshot.exists?snapshot.data() as ApprovedManagedRuntimeConfig:null;
 },
 hasApprovedRoutingSource:source=>source==='google_maps'
  ?process.env.ORDERFLY_DELIVERY_GOOGLE_RETENTION_APPROVED==='true'&&!!process.env.ORDERFLY_DELIVERY_GOOGLE_MAPS_API_KEY
  :source==='geoapify'&&geoapifyConfigured(),
 async createRouting(config){
  if(config.routingSource==='google_maps')return createGoogleRoutingAdapter({apiKey:process.env.ORDERFLY_DELIVERY_GOOGLE_MAPS_API_KEY||'',fetch});
  if(config.routingSource!=='geoapify'||config.environment!=='sandbox'||!geoapifyConfigured())return null;
  const budget=createGeoapifyBudget({quotaNamespace:process.env.ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE!});
  return createGeoapifyRoutingAdapter({apiKey:process.env.ORDERFLY_DELIVERY_GEOAPIFY_API_KEY!,fetch,
   reserveQuote:budget.reserveQuote,reserveRequest:budget.reserveRequest});
 },
 async createQuoteProvider(config,draft){
  // The native guest authority validates the persisted draft again before any private provider operation.
  const {createCustomerWoltQuoteProvider}=await import('../integrations/wolt-customer-quote');
  return createCustomerWoltQuoteProvider(draft,config.environment);
 },
});
/** Configuration only: no provider, geocoding or paid routing calls. */
export const managedDeliveryRuntimeAvailable=resolver.available;
export async function resolveManagedDeliveryRuntime(scope:{brandId:string;locationId:string},draft:AuthoritativeDraft):Promise<ManagedDeliveryRuntime|null>{return resolver.resolve(scope,draft);}

/** Explicit native mode only; a missing or unknown environment never defaults to production or sandbox. */
export function managedDeliveryRuntimeEnvironment():'sandbox'|'production'|null{
 const environment=process.env.ORDERFLY_DELIVERY_ENVIRONMENT;
 return environment==='sandbox'||environment==='production'?environment:null;
}
