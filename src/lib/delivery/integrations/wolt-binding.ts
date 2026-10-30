import 'server-only';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { inspectCustomerWoltQuoteCapability, authorizeCustomerWoltQuoteInTransaction, type CustomerWoltQuoteCapability } from './wolt-customer-quote';
import { inspectWoltDispatchCapability, authorizeWoltDispatchInTransaction, type WoltDispatchCapability } from '../booking/dispatcher';
import { deliveryScopeSchema, deliveryMoneySchema, type DeliveryScope } from '../provider-contract';
import { woltInstant } from '../providers/wolt/schedule';
import type { WoltBinding } from '../providers/wolt/binding';
import type { WoltEnvironment } from '../providers/wolt/config';
import type { WoltPrivateQuote, WoltProviderDependencies } from '../providers/wolt/provider';

// Reuse the SDK connection; accessSecretVersion and both native authority
// checks below still run for every operation. No secret payload is cached.
let secretClient: SecretManagerServiceClient | undefined;

const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const nativeRef=z.string().min(1).max(300).regex(/^[^\u0000-\u001f\u007f]+$/);
const instant=z.string().max(50).refine(v=>{try{woltInstant(v);return true;}catch{return false;}});
const environmentSchema=z.enum(['sandbox','production']);
const secretRef=z.string().regex(/^projects\/[a-z][a-z0-9-]{4,62}\/secrets\/orderfly-wolt-(sandbox|production)-[A-Za-z0-9_-]{1,100}\/versions\/[1-9][0-9]{0,10}$/);
export const woltBindingRecordSchema=z.object({schemaVersion:z.literal(1),brandId:id,locationId:id,provider:z.literal('wolt'),environment:environmentSchema,
 active:z.boolean(),revision:z.number().int().positive().safe(),merchantId:id,venueId:id,secretRef}).strict().refine(v=>v.secretRef.includes(`/secrets/orderfly-wolt-${v.environment}-`),'Secret environment mismatch');
export type WoltBindingRecord=z.infer<typeof woltBindingRecordSchema>;
/** V1 has one location/venue and one callback subscription per Wolt merchant/environment. */
export const woltMerchantRecordSchema=z.object({version:z.literal(1),environment:environmentSchema,merchantId:id,brandId:id,locationId:id,venueId:id,callbackId:z.string().regex(/^[a-f0-9]{64}$/),active:z.literal(true)}).strict();
export type WoltMerchantRecord=z.infer<typeof woltMerchantRecordSchema>;

export const woltPrivateQuoteSchema=z.object({scope:deliveryScopeSchema,quoteRef:nativeRef,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),bindingRevision:id,merchantId:id,venueId:id,environment:environmentSchema,cost:deliveryMoneySchema,
 native:z.object({promiseId:nativeRef,venueId:id,validUntil:instant.nullable(),fetchedAt:instant,
 dropoff:z.object({coordinates:z.object({lat:z.number().finite().min(-90).max(90),lon:z.number().finite().min(-180).max(180)}).strict(),formattedAddress:z.string().min(1).max(1000)}).strict(),scheduledDropoffTime:instant.nullable(),preparationMinutes:z.number().int().min(0).max(60)}).strict()
}).strict().refine(v=>v.quoteRef===v.native.promiseId&&v.venueId===v.native.venueId,'Native quote identity mismatch');
export class WoltStorageError extends Error { constructor(readonly code:'invalid_input'|'binding_unavailable'|'quote_unavailable'|'quote_conflict'|'secret_unavailable'){super(code);} }
const hash=(values:unknown[])=>createHash('sha256').update(JSON.stringify(values)).digest('hex');
export function woltBindingDocumentId(scope:DeliveryScope,environment:WoltEnvironment):string {
 const parsed=deliveryScopeSchema.parse({brandId:scope.brandId,locationId:scope.locationId});return hash([parsed.brandId,parsed.locationId,'wolt',environmentSchema.parse(environment)]);
}
export function woltPrivateQuoteDocumentId(scope:DeliveryScope,environment:WoltEnvironment,quoteRef:string):string {
 const parsed=deliveryScopeSchema.parse({brandId:scope.brandId,locationId:scope.locationId});return hash([parsed.brandId,parsed.locationId,'wolt',environmentSchema.parse(environment),nativeRef.parse(quoteRef)]);
}
export function woltMerchantDocumentId(environment:WoltEnvironment,merchantId:string):string {
 return hash(['wolt',environmentSchema.parse(environment),id.parse(merchantId)]);
}
/** Private canonical registry lookup. The caller must establish operator, worker or verified callback authority. */
export async function loadWoltMerchantInTransaction(tx:FirebaseFirestore.Transaction,environment:WoltEnvironment,merchantId:string):Promise<WoltMerchantRecord>{
 const row=await tx.get(getAdminDb().collection('deliveryWoltMerchants').doc(woltMerchantDocumentId(environment,merchantId)));
 const parsed=woltMerchantRecordSchema.safeParse(row.data());
 if(!row.exists||!parsed.success||parsed.data.environment!==environment||parsed.data.merchantId!==merchantId)throw new WoltStorageError('binding_unavailable');
 return parsed.data;
}
/** Caller must authorize the exact location within this same transaction. No public API wraps this loader. */
export async function loadWoltBindingInTransaction(tx:FirebaseFirestore.Transaction,scope:DeliveryScope,environment:WoltEnvironment):Promise<WoltBindingRecord>{
 const row=await tx.get(getAdminDb().collection('deliveryProviderBindings').doc(woltBindingDocumentId(scope,environment)));
 const parsed=woltBindingRecordSchema.safeParse(row.data());
 if(!row.exists||!parsed.success||!parsed.data.active||parsed.data.brandId!==scope.brandId||parsed.data.locationId!==scope.locationId||parsed.data.environment!==environment)throw new WoltStorageError('binding_unavailable');
 const merchant=await loadWoltMerchantInTransaction(tx,environment,parsed.data.merchantId);
 if(merchant.brandId!==scope.brandId||merchant.locationId!==scope.locationId||merchant.venueId!==parsed.data.venueId)throw new WoltStorageError('binding_unavailable');
 return parsed.data;
}
function projection(v:WoltBindingRecord):WoltBinding{return {brandId:v.brandId,locationId:v.locationId,provider:'wolt',environment:v.environment,active:true,revision:String(v.revision),merchantId:v.merchantId,venueId:v.venueId,secretRef:v.secretRef};}
function freshQuote(quote:WoltPrivateQuote,binding:WoltBindingRecord,at:number){
 const fetched=Date.parse(quote.native.fetchedAt),expires=Math.min(fetched+300000,quote.native.validUntil===null?Infinity:Date.parse(quote.native.validUntil));
 if(quote.scope.brandId!==binding.brandId||quote.scope.locationId!==binding.locationId||quote.environment!==binding.environment||quote.bindingRevision!==String(binding.revision)||quote.merchantId!==binding.merchantId||quote.venueId!==binding.venueId||at<fetched||at>=expires)throw new WoltStorageError('quote_unavailable');
 return expires;
}
async function sanitized<T>(run:()=>Promise<T>):Promise<T>{try{return await run();}catch(e){if(e instanceof WoltStorageError||e instanceof AuthorityError)throw e;throw new WoltStorageError('binding_unavailable');}}

/** Authenticated operator quote/configuration path. Background dispatch must use its own verified native claim authority. */
export async function createAuthorizedWoltStorage(rawScope:unknown,rawEnvironment:unknown):Promise<Pick<WoltProviderDependencies,'authorizeScope'|'resolveBinding'|'resolveSecret'|'saveQuote'|'loadQuote'>>{
 const identity=await verifiedOrderflyIdentity();
 const scope=Object.freeze(deliveryScopeSchema.parse(rawScope)),environment=environmentSchema.parse(rawEnvironment);
 return createStorage(scope,environment,async tx=>{await authorizeTransaction(tx,identity,scope,'orderfly.catalog:view','location');});
}
/** Order operators can cancel an existing courier; catalog permissions are not substituted. */
export async function createOrderOperatorWoltStorage(rawScope:unknown,rawEnvironment:unknown){
 const identity=await verifiedOrderflyIdentity(),scope=Object.freeze(deliveryScopeSchema.parse(rawScope)),environment=environmentSchema.parse(rawEnvironment);
 return createStorage(scope,environment,tx=>authorizeTransaction(tx,identity,scope,'orderfly.orders:edit','location'));
}
/** Public checkout obtains this opaque capability only from the native draft authority. */
export async function createCustomerWoltStorage(capability:CustomerWoltQuoteCapability,rawEnvironment:unknown){
 const inspected=inspectCustomerWoltQuoteCapability(capability),environment=environmentSchema.parse(rawEnvironment);
 if(inspected.environment!==environment)throw new AuthorityError('forbidden');
 const scope=Object.freeze({brandId:inspected.brandId,locationId:inspected.locationId});
 return createStorage(scope,environment,tx=>authorizeCustomerWoltQuoteInTransaction(tx,capability,scope));
}
/** Only the native dispatcher can mint a capability accepted by the fixed authority accessor. */
export async function createClaimedWoltStorage(capability:WoltDispatchCapability,rawEnvironment:unknown){
 const inspected=inspectWoltDispatchCapability(capability),environment=environmentSchema.parse(rawEnvironment);
 if(inspected.environment!==environment)throw new AuthorityError('forbidden');
 const scope=Object.freeze({brandId:inspected.brandId,locationId:inspected.locationId});
 return createStorage(scope,environment,tx=>authorizeWoltDispatchInTransaction(tx,capability,scope));
}
async function createStorage(scope:DeliveryScope,environment:WoltEnvironment,authorize:(tx:FirebaseFirestore.Transaction)=>Promise<void>):Promise<Pick<WoltProviderDependencies,'authorizeScope'|'resolveBinding'|'resolveSecret'|'saveQuote'|'loadQuote'>>{
 const exact=(candidate:DeliveryScope)=>candidate.brandId===scope.brandId&&candidate.locationId===scope.locationId;
 async function current(){return sanitized(()=>getAdminDb().runTransaction(async tx=>{await authorize(tx);return loadWoltBindingInTransaction(tx,scope,environment);}));}
 // Fail before returning a usable adapter and re-authorize every operation thereafter.
 await current();
 const storage:Pick<WoltProviderDependencies,'authorizeScope'|'resolveBinding'|'resolveSecret'|'saveQuote'|'loadQuote'>={
  async authorizeScope(candidate){if(!exact(candidate))return false;try{await current();return true;}catch{return false;}},
  async resolveBinding(candidate,provider){if(!exact(candidate)||provider!=='wolt')throw new AuthorityError('forbidden');return projection(await current());},
  async resolveSecret(reference,context){
   return sanitized(async()=>{
    const before=await current();if(before.secretRef!==reference||before.environment!==context.environment||before.merchantId!==context.merchantId)throw new WoltStorageError('secret_unavailable');
    let value:string|undefined;
    try{const client=secretClient??=new SecretManagerServiceClient();const [version]=await client.accessSecretVersion({name:before.secretRef});const data=version.payload?.data;value=typeof data==='string'?Buffer.from(data,'base64').toString('utf8'):data?Buffer.from(data).toString('utf8'):undefined;}catch{throw new WoltStorageError('secret_unavailable');}
    const after=await current();if(!isDeepStrictEqual(before,after))throw new WoltStorageError('secret_unavailable');
    return value;
   });
  },
  async saveQuote(raw){const quote=woltPrivateQuoteSchema.parse(raw);await sanitized(()=>getAdminDb().runTransaction(async tx=>{
    await authorize(tx);const binding=await loadWoltBindingInTransaction(tx,scope,environment);const expiresAtMs=freshQuote(quote,binding,Date.now());
    const ref=getAdminDb().collection('deliveryPrivateWoltQuotes').doc(woltPrivateQuoteDocumentId(scope,environment,quote.quoteRef));const old=await tx.get(ref);
    if(old.exists){if(!isDeepStrictEqual(old.data()?.quote,quote))throw new WoltStorageError('quote_conflict');return;}
    freshQuote(quote,binding,Date.now());tx.create(ref,{schemaVersion:1,quote,expiresAtMs});
   }));},
  async loadQuote(candidate,quoteRef){if(!exact(candidate))throw new AuthorityError('forbidden');return sanitized(()=>getAdminDb().runTransaction(async tx=>{
    await authorize(tx);const binding=await loadWoltBindingInTransaction(tx,scope,environment);
    const row=await tx.get(getAdminDb().collection('deliveryPrivateWoltQuotes').doc(woltPrivateQuoteDocumentId(scope,environment,quoteRef)));if(!row.exists)return null;
    const record=z.object({schemaVersion:z.literal(1),quote:woltPrivateQuoteSchema,expiresAtMs:z.number().int().nonnegative().safe()}).strict().parse(row.data());
    if(record.quote.quoteRef!==quoteRef||record.expiresAtMs!==freshQuote(record.quote,binding,Date.now()))throw new WoltStorageError('quote_unavailable');return record.quote;
   }));},
 };
 return Object.freeze(storage);
}
