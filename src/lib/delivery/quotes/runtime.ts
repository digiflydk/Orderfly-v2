import 'server-only';
import type {QuoteTrace} from './diagnostic-schema';
import {readManagedDeliveryAdoption} from './adoption';
import {createHash} from 'node:crypto';
import {getAdminDb} from '@/lib/firebase-admin';
import {deliveryScopeRuntimeAllowed,enrolledDeliveryEnvironment} from '../management-runtime';
import {getPlatformGeoapifyReadiness,getPlatformGeoapifyRuntime} from '../management/platform';
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
 authorizeConfig:config=>deliveryScopeRuntimeAllowed(config.scope,config.environment,'new'),
 async loadConfig(scope){
  const key=createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId])).digest('hex');
  const [adoption,snapshot]=await Promise.all([readManagedDeliveryAdoption(scope),getAdminDb().collection('deliveryRuntimeConfigs').doc(key).get()]);
  if(adoption!=='managed')return null;
  return snapshot.exists?snapshot.data() as ApprovedManagedRuntimeConfig:null;
 },
 async hasApprovedRoutingSource(source){
  if(source==='google_maps')return process.env.ORDERFLY_DELIVERY_GOOGLE_RETENTION_APPROVED==='true'&&!!process.env.ORDERFLY_DELIVERY_GOOGLE_MAPS_API_KEY;
  if(source!=='geoapify')return false;
  const platform=await getPlatformGeoapifyReadiness();
  return platform?platform.enabled&&platform.retentionApproved&&platform.keyConfigured&&!!platform.routingApprovalRef&&!!platform.retentionApprovalRef&&isGeoapifyQuotaNamespace(platform.quotaNamespace):geoapifyConfigured();
 },
 async createRouting(config){
  if(config.routingSource==='google_maps')return createGoogleRoutingAdapter({apiKey:process.env.ORDERFLY_DELIVERY_GOOGLE_MAPS_API_KEY||'',fetch});
  if(config.routingSource!=='geoapify')return null;
  const platform=await getPlatformGeoapifyReadiness();
  const configured=platform?await getPlatformGeoapifyRuntime():null;
  if(platform&&!configured)return null;
  if(!platform&&(config.environment!=='sandbox'||!geoapifyConfigured()))return null;
  const budget=createGeoapifyBudget({quotaNamespace:configured?.quotaNamespace??process.env.ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE!});
  return createGeoapifyRoutingAdapter({apiKey:configured?.apiKey??process.env.ORDERFLY_DELIVERY_GEOAPIFY_API_KEY!,fetch,
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
export async function resolveManagedDeliveryRuntime(scope:{brandId:string;locationId:string},draft:AuthoritativeDraft,expectedEnvironment?:'sandbox'|'production',trace?:QuoteTrace):Promise<ManagedDeliveryRuntime|null>{return resolver.resolve(scope,draft,expectedEnvironment,trace);}

/** Explicit native mode only; a missing or unknown environment never defaults to production or sandbox. */
export function managedDeliveryRuntimeEnvironment(scope:{brandId:string;locationId:string}):Promise<'sandbox'|'production'|null>;
export function managedDeliveryRuntimeEnvironment():'sandbox'|'production'|null;
export function managedDeliveryRuntimeEnvironment(scope?:{brandId:string;locationId:string}):Promise<'sandbox'|'production'|null>|'sandbox'|'production'|null{
 if(scope)return enrolledDeliveryEnvironment(scope);
 const environment=process.env.ORDERFLY_DELIVERY_ENVIRONMENT;
 return environment==='sandbox'||environment==='production'?environment:null;
}

/** Pin activation and environment in the same native transaction that creates a managed order. */
export async function assertManagedCheckoutRuntime(tx:FirebaseFirestore.Transaction,scope:{brandId:string;locationId:string},environment:'sandbox'|'production'){
 const key=createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId])).digest('hex');
 const row=await tx.get(getAdminDb().collection('deliveryRuntimeConfigs').doc(key)),c=row.data();
 if(!row.exists||c?.scope?.brandId!==scope.brandId||c?.scope?.locationId!==scope.locationId||c.environment!==environment
  ||!await deliveryScopeRuntimeAllowed(scope,environment,'new',tx))throw new Error('delivery_environment_changed');
}
