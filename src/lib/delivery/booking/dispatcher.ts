import {deliveryPickupWindowAllows} from '../settings/schedule';
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import {deliveryScopeRuntimeAllowed} from '../management-runtime';
import {managedStripeAccountSchema} from '../payments/stripe-authority';
import { loadDeliverySettingsInTransaction } from '../settings/server';
import { deliveryIdSchema, deliveryCreateRequestSchema, deliveryCreateResultSchema, managedDeliveryBindingSchema, type DeliveryCreateRequest, type DeliveryCreateResult, type DeliveryScope } from '../provider-contract';
import { storedDeliveryQuoteSchema } from '../quotes/schema';
import { bookingIntentSchema, transitionBookingIntent, type BookingIntent } from './state';
import { originalAttemptReference } from './server';
import { createClaimedWoltStorage, loadWoltBindingInTransaction } from '../integrations/wolt-binding';
import { createWoltProvider } from '../providers/wolt/provider';
import { completeManagedDeliveryAcceptance } from '../payments/acceptance';
import { processManagedDeliveryRefund } from '../payments/refund-worker';
import { replayWoltInboxForReference } from '../events/wolt-inbox';

const scopeSchema=z.object({brandId:deliveryIdSchema,locationId:deliveryIdSchema,orderId:deliveryIdSchema}).strict();
type Scope=z.infer<typeof scopeSchema>;
type Environment='sandbox'|'production';
export type WoltDispatchCapability=Readonly<{readonly __deliveryDispatch:unique symbol}>;
type Claim={scope:Scope;environment:Environment;claimId:string;attemptRef:string;requestDigest:string;request:DeliveryCreateRequest;revision:number;expiresAtMs:number;binding:{merchantId:string;venueId:string;bindingRevision:string};customerFeeMinor:number;maximumSubsidyMinor:number;consumed:boolean};
const capabilities=new WeakMap<object,Claim>();
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
class PreparationError extends Error { constructor(readonly code:'quote_expired'|'quote_changed'|'settings_changed'){super(code);} }
const sameScope=(a:DeliveryScope,b:DeliveryScope)=>a.brandId===b.brandId&&a.locationId===b.locationId;
async function activeEnvironment(scope:Scope):Promise<Environment> {
 const order=(await getAdminDb().runTransaction(tx=>tx.get(getAdminDb().collection('orders').doc(scope.orderId)),{readOnly:true})).data();
 if(!order||!sameScope(order as DeliveryScope,scope))throw new Error('delivery_scope_invalid');
 return managedStripeAccountSchema.parse(order.managedStripeAccount).livemode?'production':'sandbox';
}
function inspect(capability:WoltDispatchCapability,allowExpired=false):Claim {
  const value=capability&&typeof capability==='object'?capabilities.get(capability):undefined;
  if(!value||(!allowExpired&&Date.now()>=value.expiresAtMs))throw new Error('delivery_claim_invalid');
  return value;
}
export function inspectWoltDispatchCapability(capability:WoltDispatchCapability):Readonly<DeliveryScope&{environment:Environment}> {
  const value=inspect(capability);return Object.freeze({brandId:value.scope.brandId,locationId:value.scope.locationId,environment:value.environment});
}
/** Fixed native authority accessor used by private Wolt storage, never a caller-provided true flag. */
export async function authorizeWoltDispatchInTransaction(tx:FirebaseFirestore.Transaction,capability:WoltDispatchCapability,scope:DeliveryScope):Promise<void> {
  const claim=inspect(capability);
  if(!sameScope(claim.scope,scope)||!await deliveryScopeRuntimeAllowed(scope,claim.environment,'recovery',tx))throw new Error('delivery_dispatch_disabled');
  const db=getAdminDb(),orderRef=db.collection('orders').doc(claim.scope.orderId);
  const [orderSnap,attemptSnap,dispatchSnap]=await Promise.all([tx.get(orderRef),tx.get(orderRef.collection('deliveryAttempts').doc('original')),tx.get(orderRef.collection('deliveryDispatch').doc('original'))]);
  const order=orderSnap.data(),attempt=bookingIntentSchema.parse(attemptSnap.data()),dispatch=dispatchSnap.data(),managed=managedDeliveryBindingSchema.parse(order?.managedDelivery);
  if(!order||!sameScope(order as DeliveryScope,scope)||order.deliveryType!=='Delivery'||order.paymentStatus!=='Paid'||order.status!=='Pending'
    ||managedStripeAccountSchema.parse(order.managedStripeAccount).livemode!==(claim.environment==='production')
    ||managed.providerId!=='wolt'||managed.requestDigest!==claim.requestDigest||attempt.reference!==claim.attemptRef||attempt.requestDigest!==claim.requestDigest
    ||!sameScope(attempt.scope,scope)||attempt.scope.orderId!==claim.scope.orderId||attempt.state!=='submitting'||attempt.revision!==claim.revision
    ||dispatch?.claimId!==claim.claimId||dispatch.environment!==claim.environment||dispatch.requestDigest!==claim.requestDigest||dispatch.expiresAtMs!==claim.expiresAtMs)throw new Error('delivery_claim_changed');
  const quote=storedDeliveryQuoteSchema.parse((await tx.get(db.collection('deliveryQuotes').doc(managed.quoteRef))).data());
  if(quote.contentDigest!==claim.requestDigest||quote.quoteRef!==managed.quoteRef||!sameScope(quote.binding,scope)||Date.now()<quote.createdAtMs||Date.now()>=quote.expiresAtMs)throw new Error('delivery_quote_expired');
  const {result}=await loadDeliverySettingsInTransaction(tx,scope.brandId,scope.locationId);
  if(!deliveryPickupWindowAllows(result.settings,quote.fulfillment.readyAt,quote.providerQuote.pickupInterval))throw new Error('delivery_settings_changed');
  if(result.brandRevision!==quote.binding.brandRevision||result.revision!==quote.binding.locationRevision||!isDeepStrictEqual(result.settings.pricingRules,(quote.economics.baseRules ?? quote.economics.rules)))throw new Error('delivery_settings_changed');
  if(!result.settings.enabled||result.settings.paused||result.settings.providerId!=='wolt')throw new Error('delivery_dispatch_disabled');
}
async function validateClaimedWoltAttempt(capability:WoltDispatchCapability,request:Readonly<DeliveryCreateRequest>):Promise<boolean>{
  const claim=inspect(capability);
  if(claim.consumed||!isDeepStrictEqual(request,claim.request))return false;
  // In-process consumption is synchronous; native claim remains submitting forever until outcome/reconciliation.
  claim.consumed=true;
  try{await getAdminDb().runTransaction(async tx=>{
    await authorizeWoltDispatchInTransaction(tx,capability,claim.scope);
    const ref=getAdminDb().collection('orders').doc(claim.scope.orderId).collection('deliveryDispatch').doc('original'),saved=await tx.get(ref);
    if(saved.data()?.networkStartedAtMs!==null)throw new Error('delivery_claim_consumed');
    tx.update(ref,{networkStartedAtMs:Date.now()});
  });return true;}catch{return false;}
}
async function claimOriginal(scope:Scope,environment:Environment):Promise<WoltDispatchCapability|null>{
  const db=getAdminDb(),orderRef=db.collection('orders').doc(scope.orderId),jobRef=db.collection('deliveryDispatchJobs').doc(scope.orderId);
  const attemptRef=orderRef.collection('deliveryAttempts').doc('original'),dispatchRef=orderRef.collection('deliveryDispatch').doc('original');
  const claim=await db.runTransaction(async tx=>{
    const [orderSnap,jobSnap,attemptSnap,dispatchSnap]=await Promise.all([tx.get(orderRef),tx.get(jobRef),tx.get(attemptRef),tx.get(dispatchRef)]);
    const order=orderSnap.data(),job=jobSnap.data(),managed=managedDeliveryBindingSchema.parse(order?.managedDelivery);
    if(!order||!sameScope(order as DeliveryScope,scope)||order.deliveryType!=='Delivery'||order.paymentStatus!=='Paid'||order.status!=='Pending'
      ||managed.providerId!=='wolt'||job?.version!==1||job.orderId!==scope.orderId||!sameScope(job as DeliveryScope,scope)||job.providerId!=='wolt'||job.requestDigest!==managed.requestDigest)throw new Error('delivery_order_ineligible');
    if(!await deliveryScopeRuntimeAllowed(scope,environment,'recovery',tx))throw new Error('delivery_dispatch_disabled');
    if(managedStripeAccountSchema.parse(order.managedStripeAccount).livemode!==(environment==='production'))throw new Error('delivery_payment_environment_changed');
    if(job.state!=='pending')return null;
    if(dispatchSnap.exists)throw new Error('delivery_claim_exists');
    const reference=originalAttemptReference(scope),now=Date.now();
    const previous:BookingIntent=attemptSnap.exists?bookingIntentSchema.parse(attemptSnap.data()):{schemaVersion:1,scope,provider:'wolt',intentId:reference,reference,requestDigest:managed.requestDigest,revision:0,state:'pending',providerDeliveryId:null,createdAt:now,updatedAt:now};
    if(previous.state!=='pending')return null;
    if(previous.reference!==reference||previous.intentId!==reference||previous.provider!=='wolt'||previous.requestDigest!==managed.requestDigest||!isDeepStrictEqual(previous.scope,scope))throw new Error('delivery_attempt_conflict');
    const quoteParsed=storedDeliveryQuoteSchema.safeParse((await tx.get(db.collection('deliveryQuotes').doc(managed.quoteRef))).data());
    if(!quoteParsed.success)throw new PreparationError('quote_changed');const quote=quoteParsed.data;
    if(quote.quoteRef!==managed.quoteRef||quote.contentDigest!==managed.requestDigest||!sameScope(quote.binding,scope)||quote.binding.providerId!=='wolt')throw new PreparationError('quote_changed');
    if(now<quote.createdAtMs||now>=quote.expiresAtMs)throw new PreparationError('quote_expired');
    const {result}=await loadDeliverySettingsInTransaction(tx,scope.brandId,scope.locationId);
    if(!deliveryPickupWindowAllows(result.settings,quote.fulfillment.readyAt,quote.providerQuote.pickupInterval))throw new PreparationError('settings_changed');
    if(!result.settings.enabled||result.settings.paused||result.settings.providerId!=='wolt'||result.brandRevision!==quote.binding.brandRevision||result.revision!==quote.binding.locationRevision||!isDeepStrictEqual(result.settings.pricingRules,(quote.economics.baseRules ?? quote.economics.rules)))throw new PreparationError('settings_changed');
    const binding=await loadWoltBindingInTransaction(tx,{brandId:scope.brandId,locationId:scope.locationId},environment);
    const request=deliveryCreateRequestSchema.parse({version:1,scope:{brandId:scope.brandId,locationId:scope.locationId},providerId:'wolt',orderRef:scope.orderId,attemptRef:reference,
      quoteRef:quote.providerQuoteRef,requestDigest:managed.requestDigest,readyAt:quote.fulfillment.readyAt,deliveryInterval:quote.fulfillment.desiredDelivery.kind==='scheduled'?quote.fulfillment.desiredDelivery.interval:null,quotedCost:quote.providerQuote.cost,fulfillment:quote.fulfillment});
    const next=transitionBookingIntent(previous,{scope,intentId:reference,reference,requestDigest:managed.requestDigest,expectedRevision:previous.revision,now,outcome:{kind:'submit'}});
    const saved={version:1,scope,environment,claimId:randomUUID(),attemptRef:reference,requestDigest:managed.requestDigest,request,revision:next.revision,
      expiresAtMs:now+300000,customerFeeMinor:quote.economics.customerFee.amountMinor,maximumSubsidyMinor:quote.economics.rules.maximumSubsidyMinor,binding:{merchantId:binding.merchantId,venueId:binding.venueId,bindingRevision:String(binding.revision)},networkStartedAtMs:null,createdAtMs:now};
    tx.create(db.collection('deliveryAttemptReferences').doc(reference),{version:1,...scope,providerId:'wolt',attemptRef:reference,requestDigest:managed.requestDigest,claimId:saved.claimId,environment});
    tx.set(attemptRef,next);tx.create(dispatchRef,saved);tx.update(jobRef,{state:'submitting',claimId:saved.claimId,updatedAtMs:now});
    return {...saved,consumed:false};
  });
  if(!claim)return null;
  const capability=Object.freeze({}) as WoltDispatchCapability;capabilities.set(capability,claim);return capability;
}
async function recordOutcome(capability:WoltDispatchCapability,result:DeliveryCreateResult):Promise<void>{
  const claim=inspect(capability,true),db=getAdminDb(),orderRef=db.collection('orders').doc(claim.scope.orderId),jobRef=db.collection('deliveryDispatchJobs').doc(claim.scope.orderId);
  await db.runTransaction(async tx=>{
    const attemptRef=orderRef.collection('deliveryAttempts').doc('original'),dispatchRef=orderRef.collection('deliveryDispatch').doc('original'),resultRef=orderRef.collection('deliveryDispatchResults').doc('original');
    const [orderSnap,attemptSnap,dispatchSnap,resultSnap,jobSnap]=await Promise.all([tx.get(orderRef),tx.get(attemptRef),tx.get(dispatchRef),tx.get(resultRef),tx.get(jobRef)]);
    const order=orderSnap.data(),managed=managedDeliveryBindingSchema.parse(order?.managedDelivery),attempt=bookingIntentSchema.parse(attemptSnap.data()),dispatch=dispatchSnap.data(),job=jobSnap.data();
    if(!order||!sameScope(order as DeliveryScope,claim.scope)||managed.providerId!=='wolt'||managed.requestDigest!==claim.requestDigest||dispatch?.claimId!==claim.claimId||job?.claimId!==claim.claimId)throw new Error('delivery_result_conflict');
    if(resultSnap.exists){if(!isDeepStrictEqual(resultSnap.data()?.result,result))throw new Error('delivery_result_conflict');return;}
    const now=Date.now(),outcome=result.kind==='accepted'?{kind:'accepted' as const,providerDeliveryId:result.providerDeliveryId}:{kind:result.kind};
    const next=transitionBookingIntent(attempt,{scope:claim.scope,intentId:claim.attemptRef,reference:claim.attemptRef,requestDigest:claim.requestDigest,expectedRevision:attempt.state==='unknown'&&attempt.revision===claim.revision+1?attempt.revision:claim.revision,now,outcome});
    const referenceRef=result.kind==='accepted'?db.collection('deliveryProviderReferences').doc(hash(['wolt',claim.binding.merchantId,result.nativeReference])):null;
    const previousReference=referenceRef?await tx.get(referenceRef):null;
    const mapping=result.kind==='accepted'?{...claim.scope,providerDeliveryId:result.providerDeliveryId,nativeOrderReference:result.nativeReference,merchantId:claim.binding.merchantId,venueId:claim.binding.venueId,environment:claim.environment,bindingRevision:z.number().int().positive().safe().parse(Number(claim.binding.bindingRevision))}:null;
    if(previousReference?.exists&&!isDeepStrictEqual(previousReference.data(),mapping))throw new Error('delivery_provider_reference_conflict');
    const costException=result.kind==='accepted'&&(result.cost===null||result.cost.currency!==claim.request.quotedCost.currency||result.cost.taxBasis!==claim.request.quotedCost.taxBasis||result.cost.amountMinor!==claim.request.quotedCost.amountMinor)
      ? {reason:result.cost===null?'accepted_provider_cost_unknown':'accepted_provider_cost_changed',requiresReview:true,quotedCost:claim.request.quotedCost,acceptedCost:result.cost,customerFeeMinor:claim.customerFeeMinor,maximumSubsidyMinor:claim.maximumSubsidyMinor}:null;
    tx.set(attemptRef,next);tx.create(resultRef,{version:1,scope:claim.scope,attemptRef:claim.attemptRef,requestDigest:claim.requestDigest,providerId:'wolt',claimId:claim.claimId,result,costException,recordedAtMs:now});
    tx.update(jobRef,{state:result.kind==='accepted'?'booked':result.kind==='rejected'?'rejected':'unknown',acceptanceCompletedAtMs:null,inboxReplayCursor:null,inboxReplayCompletedAtMs:null,inboxReplayRevision:0,refundCompletedAtMs:null,refundReviewRequired:false,updatedAtMs:now});
    if(costException)tx.update(orderRef,{deliveryCostException:costException});
    if(referenceRef&&!previousReference?.exists)tx.create(referenceRef,mapping!);

  });
}
/** Definitive local non-dispatch evidence. Re-read every native binding before compensation eligibility. */
async function recordPreparationRejection(scope:Scope,reason:PreparationError['code']):Promise<boolean>{
 const db=getAdminDb(),orderRef=db.collection('orders').doc(scope.orderId),jobRef=db.collection('deliveryDispatchJobs').doc(scope.orderId);
 return db.runTransaction(async tx=>{
  const attemptRef=orderRef.collection('deliveryAttempts').doc('original'),dispatchRef=orderRef.collection('deliveryDispatch').doc('original'),resultRef=orderRef.collection('deliveryDispatchResults').doc('original');
  const [orderSnap,jobSnap,attemptSnap,dispatchSnap,resultSnap]=await Promise.all([tx.get(orderRef),tx.get(jobRef),tx.get(attemptRef),tx.get(dispatchRef),tx.get(resultRef)]);
  const order=orderSnap.data(),job=jobSnap.data(),managed=managedDeliveryBindingSchema.parse(order?.managedDelivery);
  if(!order||!sameScope(order as DeliveryScope,scope)||order.deliveryType!=='Delivery'||order.paymentStatus!=='Paid'||order.status!=='Pending'||managed.providerId!=='wolt'
    ||job?.state!=='pending'||job.orderId!==scope.orderId||!sameScope(job as DeliveryScope,scope)||job.requestDigest!==managed.requestDigest||dispatchSnap.exists||resultSnap.exists)return false;
  const now=Date.now(),reference=originalAttemptReference(scope);
  const previous:BookingIntent=attemptSnap.exists?bookingIntentSchema.parse(attemptSnap.data()):{schemaVersion:1,scope,provider:'wolt',intentId:reference,reference,requestDigest:managed.requestDigest,revision:0,state:'pending',providerDeliveryId:null,createdAt:now,updatedAt:now};
  if(previous.state!=='pending'||previous.reference!==reference||previous.requestDigest!==managed.requestDigest||!isDeepStrictEqual(previous.scope,scope))return false;
  const result:DeliveryCreateResult={kind:'rejected',error:{code:reason,messageKey:'delivery.'+reason,retry:'never',nativeCode:null}};
  tx.set(attemptRef,{...previous,state:'rejected',revision:previous.revision+1,updatedAt:now});
  tx.create(resultRef,{version:1,scope,attemptRef:reference,requestDigest:managed.requestDigest,providerId:'wolt',claimId:null,result,evidence:'definitive_local_no_dispatch',recordedAtMs:now});
  tx.update(jobRef,{state:'rejected',refundCompletedAtMs:null,refundReviewRequired:false,updatedAtMs:now});return true;
 });
}
const unknown=(attemptRef:string):DeliveryCreateResult=>({kind:'unknown',attemptRef,error:{code:'dispatch_outcome_unknown',messageKey:'delivery.dispatch_outcome_unknown',retry:'after_reconciliation',nativeCode:null}});
export async function dispatchManagedDelivery(rawScope:unknown):Promise<{state:'disabled'|'not_pending'|'booked'|'rejected'|'unknown'}>{
  const scope=scopeSchema.parse(rawScope),environment=await activeEnvironment(scope);
  if(!await deliveryScopeRuntimeAllowed(scope,environment,'recovery'))return {state:'disabled'};
  let capability:WoltDispatchCapability|null;
  try{capability=await claimOriginal(scope,environment);}catch(error){
    if(error instanceof PreparationError&&await recordPreparationRejection(scope,error.code)){
      try{await processManagedDeliveryRefund(scope);}catch{/* durable rejected job retries compensation */}
      return {state:'rejected'};
    }
    throw error;
  }
  if(!capability)return {state:'not_pending'};
  const claim=inspect(capability);let result:DeliveryCreateResult;
  try{
    const storage=await createClaimedWoltStorage(capability,environment);
    const provider=createWoltProvider({...storage,environment,validateClaimedAttempt:request=>validateClaimedWoltAttempt(capability,request),loadCancellation:async()=>null});
    result=deliveryCreateResultSchema.parse(await provider.create(structuredClone(claim.request)));
    if(result.kind==='unknown'&&result.attemptRef!==claim.attemptRef)result=unknown(claim.attemptRef);
  }catch{result=unknown(claim.attemptRef);}
  await recordOutcome(capability,result);
  if(result.kind==='accepted'){
    try{await completeManagedDeliveryAcceptance(scope);}catch{/* durable booked job retries acceptance */}
    try{await replayAcceptedInbox(scope);}catch{/* provider inbox remains durable */}
  }else if(result.kind==='rejected'){try{await processManagedDeliveryRefund(scope);}catch{/* durable rejected job retries compensation */}}
  return {state:result.kind==='accepted'?'booked':result.kind};
}
/** Persist each bounded early-inbox continuation. Callback revision bumps invalidate old page checkpoints. */
async function replayAcceptedInbox(scope:Scope):Promise<void>{
 const db=getAdminDb(),jobRef=db.collection('deliveryDispatchJobs').doc(scope.orderId),orderRef=db.collection('orders').doc(scope.orderId);
 const prepared=await db.runTransaction(async tx=>{
  const [jobSnap,orderSnap,resultSnap,claimSnap]=await Promise.all([tx.get(jobRef),tx.get(orderRef),tx.get(orderRef.collection('deliveryDispatchResults').doc('original')),tx.get(orderRef.collection('deliveryDispatch').doc('original'))]);
  const job=jobSnap.data(),order=orderSnap.data(),resultRecord=resultSnap.data(),claim=claimSnap.data();
  if(!job||job.state!=='booked'||job.inboxReplayCompletedAtMs!==null)return null;
  const result=deliveryCreateResultSchema.parse(resultRecord?.result);
  if(!order||!resultRecord||!sameScope(order as DeliveryScope,scope)||job.orderId!==scope.orderId||!sameScope(job as DeliveryScope,scope)||!claim||claim.claimId!==resultRecord?.claimId||result.kind!=='accepted'
    ||claim.requestDigest!==order.managedDelivery?.requestDigest||resultRecord.requestDigest!==claim.requestDigest||!sameScope(resultRecord.scope,scope)||resultRecord.scope.orderId!==scope.orderId
    ||!Number.isSafeInteger(job.inboxReplayRevision)||job.inboxReplayRevision<0||!(job.inboxReplayCursor===null||typeof job.inboxReplayCursor==='string'&&/^[a-f0-9]{64}$/.test(job.inboxReplayCursor)))throw new Error('delivery_replay_binding');
  if(!await deliveryScopeRuntimeAllowed(scope,z.enum(['sandbox','production']).parse(claim.environment),'recovery',tx))return null;
  return {merchantId:claim.binding.merchantId as string,nativeReference:result.nativeReference,environment:claim.environment as Environment,cursor:job.inboxReplayCursor as string|null,revision:job.inboxReplayRevision as number};
 });
 if(!prepared)return;
 const result=await replayWoltInboxForReference(prepared.merchantId,prepared.nativeReference,prepared.environment,prepared.cursor??undefined);
 const nextCursor=z.string().regex(/^[a-f0-9]{64}$/).nullable().parse(result.nextCursor);
 await db.runTransaction(async tx=>{const job=(await tx.get(jobRef)).data();if(!job||job.state!=='booked'||job.inboxReplayRevision!==prepared.revision||job.inboxReplayCursor!==prepared.cursor||job.inboxReplayCompletedAtMs!==null)return;
  tx.update(jobRef,{inboxReplayCursor:nextCursor,inboxReplayCompletedAtMs:nextCursor===null?Date.now():null});
 });
}
/** Crash recovery proves only unknown outcome, never absence and never permission to redispatch. */
async function recoverExpiredSubmittingJobs():Promise<number>{
 const db=getAdminDb(),jobs=await db.collection('deliveryDispatchJobs').where('state','==','submitting').limit(10).get();let recovered=0;
 for(const jobDoc of jobs.docs){
  const changed=await db.runTransaction(async tx=>{
   const jobRef=db.collection('deliveryDispatchJobs').doc(jobDoc.id),job=(await tx.get(jobRef)).data();
   if(!job||job.state!=='submitting'||job.orderId!==jobDoc.id)return false;
   const scope=scopeSchema.parse({brandId:job.brandId,locationId:job.locationId,orderId:job.orderId}),orderRef=db.collection('orders').doc(scope.orderId);
   const [orderSnap,attemptSnap,claimSnap]=await Promise.all([tx.get(orderRef),tx.get(orderRef.collection('deliveryAttempts').doc('original')),tx.get(orderRef.collection('deliveryDispatch').doc('original'))]);
   const order=orderSnap.data(),attempt=bookingIntentSchema.parse(attemptSnap.data()),claim=claimSnap.data();
   if(!order||!sameScope(order as DeliveryScope,scope)||!claim||claim.claimId!==job.claimId||!Number.isSafeInteger(claim.expiresAtMs)||Date.now()<claim.expiresAtMs)return false;
   const environment=z.enum(['sandbox','production']).parse(claim.environment);
   if(!await deliveryScopeRuntimeAllowed(scope,environment,'recovery',tx))return false;
   if(attempt.state!=='submitting'||attempt.reference!==originalAttemptReference(scope)||attempt.requestDigest!==job.requestDigest)return false;
   const next=transitionBookingIntent(attempt,{scope,intentId:attempt.intentId,reference:attempt.reference,requestDigest:attempt.requestDigest,expectedRevision:attempt.revision,now:Date.now(),outcome:{kind:'unknown'}});
   tx.set(orderRef.collection('deliveryAttempts').doc('original'),next);tx.update(jobRef,{state:'unknown',reason:'worker_interrupted',updatedAtMs:Date.now()});return true;
  });if(changed)recovered++;
 }
 return recovered;
}
/** Only retries local preparation while the native job is still pending and no dispatch claim exists. */
async function deferPreparationFailure(jobId:string):Promise<void>{
 const db=getAdminDb(),ref=db.collection('deliveryDispatchJobs').doc(deliveryIdSchema.parse(jobId));
 await db.runTransaction(async tx=>{
  const job=(await tx.get(ref)).data();if(!job||job.state!=='pending')return;
  const claim=await tx.get(db.collection('orders').doc(jobId).collection('deliveryDispatch').doc('original'));
  if(claim.exists){tx.update(ref,{state:'unknown',reason:'existing_dispatch_claim',updatedAtMs:Date.now()});return;}
  const prior=Number.isSafeInteger(job.preparationFailures)&&job.preparationFailures>=0?Math.min(job.preparationFailures,3):0;
  const failures=prior+1,now=Date.now();
  tx.update(ref,{state:failures>=3?'blocked':'pending',preparationFailures:failures,nextAttemptAtMs:now+Math.min(60000*2**prior,900000),lastError:'dispatch_preparation_unavailable',updatedAtMs:now});
 });
}
/** Protected existing heartbeat calls this bounded worker. Unknown jobs are never redispatched. */
export async function runDeliveryDispatchWorker(){
 const db=getAdminDb(),deadline=Date.now()+45000,recovered=await recoverExpiredSubmittingJobs();
 const replayJobs=await db.collection('deliveryDispatchJobs').where('state','==','booked').where('inboxReplayCompletedAtMs','==',null).limit(5).get();
 for(const doc of replayJobs.docs){if(Date.now()>=deadline)break;try{const job=doc.data();if(doc.id!==job.orderId)continue;await replayAcceptedInbox(scopeSchema.parse({brandId:job.brandId,locationId:job.locationId,orderId:job.orderId}));}catch{/* durable cursor retries next heartbeat */}}
 const jobs=await db.collection('deliveryDispatchJobs').where('state','==','pending').limit(10).get(),counts={processed:0,failed:0,accepted:0,compensation:0,recovered};
 let attempted=0;
 for(const doc of jobs.docs){
  if(Date.now()>=deadline||attempted>=2)break;
  const job=doc.data();if(typeof job.nextAttemptAtMs==='number'&&job.nextAttemptAtMs>Date.now())continue;
  attempted++;
  try{if(doc.id!==job.orderId)throw new Error('delivery_job_invalid');const outcome=await dispatchManagedDelivery({brandId:job.brandId,locationId:job.locationId,orderId:job.orderId});if(outcome.state!=='disabled')counts.processed++;}
  catch{counts.failed++;try{await deferPreparationFailure(doc.id);}catch{/* failure does not authorize re-dispatch */}}
 }

 for(const [state,marker] of [['booked','acceptanceCompletedAtMs'],['rejected','refundCompletedAtMs']] as const){
  let pendingQuery=db.collection('deliveryDispatchJobs').where('state','==',state).where(marker,'==',null);
  if(state==='rejected')pendingQuery=pendingQuery.where('refundReviewRequired','==',false);
  const pending=await pendingQuery.limit(5).get();
  for(const doc of pending.docs){if(Date.now()>=deadline)break;try{const job=doc.data();if(doc.id!==job.orderId)throw new Error('delivery_job_invalid');const scope=scopeSchema.parse({brandId:job.brandId,locationId:job.locationId,orderId:job.orderId});
   if(!await deliveryScopeRuntimeAllowed(scope,await activeEnvironment(scope),'recovery'))continue;
   if(state==='booked'){await completeManagedDeliveryAcceptance(scope);counts.accepted++;}else{await processManagedDeliveryRefund(scope);counts.compensation++;}
  }catch{counts.failed++;}}
 }
 return {state:'processed',...counts};
}
