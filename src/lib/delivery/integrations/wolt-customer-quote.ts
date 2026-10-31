import {deliveryScheduleAt} from '../settings/schedule';
import 'server-only';
import {deliveryScopeRuntimeAllowed} from '../management-runtime';
import {createHash} from 'node:crypto';
import type {ApprovedManagedRuntimeConfig} from '../quotes/runtime-configured';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { loadDeliverySettingsInTransaction } from '../settings/server';
import { deliveryIdSchema, deliveryQuoteRequestSchema, type DeliveryProvider, type DeliveryScope } from '../provider-contract';
import { createCustomerWoltStorage } from './wolt-binding';
import { createWoltProvider,woltCapabilities } from '../providers/wolt/provider';
import {restaurantFingerprint} from '../quotes/restaurant-snapshot';
import {invalidateQuoteRestaurant} from '../quotes/restaurant-cache';
import type {Brand,Location} from '@/types';

const integer=z.number().int().nonnegative().safe(),digest=z.string().regex(/^[a-f0-9]{64}$/);
const draftSchema=z.object({restaurantFingerprint:digest.optional(),checkoutKeyHash:digest,requestDigest:digest,draftRevision:integer,addressRevision:integer,
 itemSubtotalAfterDiscountMinor:integer,bagFeeMinor:integer,adminFeeMinor:integer,
 binding:z.object({brandId:deliveryIdSchema,locationId:deliveryIdSchema,checkoutReference:deliveryIdSchema,providerId:z.literal('wolt'),normalizedAddress:z.string().trim().min(1).max(1000),cartDigest:digest,fulfillmentAt:z.string().datetime({offset:true}),brandRevision:integer,locationRevision:integer}).strict(),
}).strict();
type Draft=z.infer<typeof draftSchema>;
type Environment='sandbox'|'production';
export type CustomerWoltQuoteCapability=Readonly<{readonly __customerWoltQuote:unique symbol}>;
type Entry={draft:Draft;environment:Environment;expiresAtMs:number;runtimeConfig?:ApprovedManagedRuntimeConfig};
const capabilities=new WeakMap<object,Entry>();
function expiry(raw:FirebaseFirestore.DocumentData):number {
 if(Number.isSafeInteger(raw.expiresAtMs)&&raw.expiresAtMs>=0)return raw.expiresAtMs;
 const value=raw.expiresAt;
 if(value instanceof Date)return value.getTime();
 if(value&&typeof value.toMillis==='function')return value.toMillis();
 throw new Error('delivery_customer_draft_expiry');
}
function inspect(capability:CustomerWoltQuoteCapability):Entry {
 const entry=capability&&typeof capability==='object'?capabilities.get(capability):undefined;
 if(!entry||Date.now()>=entry.expiresAtMs)throw new Error('delivery_customer_quote_authority');

 return entry;
}
export function inspectCustomerWoltQuoteCapability(capability:CustomerWoltQuoteCapability):Readonly<DeliveryScope&{environment:Environment}>{
 const {draft,environment}=inspect(capability);return Object.freeze({brandId:draft.binding.brandId,locationId:draft.binding.locationId,environment});
}
/** Fixed native authority accessor. It never trusts a browser-provided verified flag or callback. */
export async function authorizeCustomerWoltQuoteInTransaction(tx:FirebaseFirestore.Transaction,capability:CustomerWoltQuoteCapability,scope:DeliveryScope):Promise<void>{
 const entry=inspect(capability),expected=entry.draft,binding=expected.binding;
 if(scope.brandId!==binding.brandId||scope.locationId!==binding.locationId)throw new Error('delivery_customer_quote_scope');
 const db=getAdminDb();
 const configKey=createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId])).digest('hex');
 const configRead=entry.runtimeConfig?Promise.all([tx.get(db.collection('deliveryRuntimeConfigs').doc(configKey)),tx.get(db.collection('deliveryAdoptions').doc(configKey))]).then(([config,adoption])=>{
  const marker=adoption.data();
  if(!isDeepStrictEqual(config.data(),entry.runtimeConfig)||marker?.version!==1||marker.brandId!==scope.brandId||marker.locationId!==scope.locationId||marker.mode!=='managed')throw new Error('delivery_customer_settings_changed');
 }):Promise.resolve();
 const locationRead=tx.get(db.collection('locations').doc(binding.locationId));
 const [draftSnap,brandSnap,locationSnap,allowed,settings]=await Promise.all([tx.get(db.collection('deliveryCheckoutDrafts').doc(expected.checkoutKeyHash)),tx.get(db.collection('brands').doc(binding.brandId)),locationRead,deliveryScopeRuntimeAllowed(scope,entry.environment,'new',tx),loadDeliverySettingsInTransaction(tx,binding.brandId,binding.locationId,locationRead),configRead]);
 if(!allowed)throw new Error('delivery_customer_quote_disabled');
 const raw=draftSnap.data(),location=locationSnap.data();
 if(!raw||!brandSnap.exists||!locationSnap.exists||location?.brandId!==binding.brandId||location.isActive!==true)throw new Error('delivery_customer_quote_scope');
 const {expiresAt:_expiresAt,expiresAtMs:_expiresAtMs,...nativeDraft}=raw;
 if(!isDeepStrictEqual(draftSchema.parse(nativeDraft),expected)||Date.now()>=expiry(raw))throw new Error('delivery_customer_draft_changed');
 if(expected.restaurantFingerprint&&restaurantFingerprint({...brandSnap.data(),id:binding.brandId} as Brand,{...location,id:binding.locationId} as Location)!==expected.restaurantFingerprint){invalidateQuoteRestaurant();throw new Error('delivery_customer_settings_changed');}
 const {result}=settings;
 if(!deliveryScheduleAt(result.settings,new Date(binding.fulfillmentAt)).open)throw new Error('delivery_customer_settings_changed');
 if(!result.settings.enabled||result.settings.paused||result.settings.providerId!=='wolt'||result.brandRevision!==binding.brandRevision||result.revision!==binding.locationRevision)throw new Error('delivery_customer_settings_changed');
}
const forbidden=()=>({code:'quote_only_capability',messageKey:'delivery.quote_only_capability',retry:'never' as const,nativeCode:null});
/** Internal composition after saveAuthoritativeCustomerDraft. The returned facade cannot dispatch or cancel. */
export async function createCustomerWoltQuoteProvider(rawDraft:unknown,rawEnvironment:unknown,runtimeConfig?:ApprovedManagedRuntimeConfig):Promise<DeliveryProvider>{
 const draft=draftSchema.parse(rawDraft),environment=z.enum(['sandbox','production']).parse(rawEnvironment);
 if(draft.binding.checkoutReference!==draft.checkoutKeyHash)throw new Error('delivery_customer_draft_changed');
 const capability=Object.freeze({}) as CustomerWoltQuoteCapability;
 // One-shot facade; native draft expiry is checked before Wolt and again at commit.
 capabilities.set(capability,{draft:structuredClone(draft),environment,expiresAtMs:Date.now()+300000,...(runtimeConfig?{runtimeConfig:structuredClone(runtimeConfig)}:{})});
 const scope={brandId:draft.binding.brandId,locationId:draft.binding.locationId};
 try{
  let used=false;
  return Object.freeze({providerId:'wolt',capabilities:woltCapabilities,
   async quote(raw:unknown){
    const request=deliveryQuoteRequestSchema.parse(raw),fields=(a:typeof request.pickup)=>[a.country,a.postcode,a.city,a.street,a.building,a.unit];
    if(request.providerId!=='wolt'||request.scope.brandId!==scope.brandId||request.scope.locationId!==scope.locationId||request.checkoutRef!==draft.checkoutKeyHash
      ||request.readyAt!==draft.binding.fulfillmentAt||JSON.stringify([fields(request.pickup),fields(request.dropoff)])!==draft.binding.normalizedAddress)throw new Error('delivery_customer_quote_request_changed');
    if(used)throw new Error('delivery_customer_quote_used');used=true;
    try{
     const storage=await createCustomerWoltStorage(capability,environment);
     const provider=createWoltProvider({...storage,environment,validateClaimedAttempt:async()=>false,loadCancellation:async()=>null});
     return await provider.quote(request);
    }finally{capabilities.delete(capability);}
   },
   async create(){return {kind:'rejected' as const,error:forbidden()};},
   async cancel(){return {kind:'unsupported' as const};},
   async reconcile(){return {kind:'unsupported' as const};},
  });
 }catch(error){capabilities.delete(capability);throw error;}
}
