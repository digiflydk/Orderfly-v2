import 'server-only';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getAdminDb } from '@/lib/firebase-admin';
import { retainUnmappedWoltReconciliation } from '../booking/wolt-reconciliation';
import { loadWoltBindingInTransaction, loadWoltMerchantInTransaction } from '../integrations/wolt-binding';
import { verifyWoltWebhook, WOLT_WEBHOOK_MAX_BYTES, WoltWebhookError } from '../providers/wolt/webhook-verify';
import { normalizeWoltEvent, type NormalizedWoltEvent } from '../providers/wolt/events';
import { verifiedDeliveryEventSchema } from '../provider-contract';
import { bookingIntentSchema } from '../booking/state';
import { deliveryEventSnapshotSchema, planVerifiedDeliveryEvent } from './state';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), native=z.string().min(1).max(300);
const environment=z.enum(['sandbox','production']);
const callbackSchema=z.object({version:z.literal(1),active:z.boolean(),brandId:id,locationId:id,environment,
 merchantId:id,venueId:id,bindingRevision:z.number().int().positive().safe(),revision:z.number().int().positive().safe(),
 signingSecretRef:z.string().regex(/^projects\/[a-z][a-z0-9-]{4,62}\/secrets\/orderfly-wolt-webhook-(sandbox|production)-[A-Za-z0-9_-]{1,100}\/versions\/[1-9][0-9]{0,10}$/)
}).strict().refine(v=>v.signingSecretRef.includes(`/secrets/orderfly-wolt-webhook-${v.environment}-`));
const referenceSchema=z.object({brandId:id,locationId:id,orderId:id,providerDeliveryId:native,nativeOrderReference:native,
 merchantId:id,venueId:id,environment,bindingRevision:z.number().int().positive().safe()}).strict();
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const woltReferenceId=(merchantId:string,nativeOrderReference:string)=>hash(['wolt',merchantId,nativeOrderReference]);
export const woltCallbackId=(key:string)=>createHash('sha256').update(key).digest('hex');
async function currentCallback(tx:FirebaseFirestore.Transaction,key:string){
 const row=await tx.get(getAdminDb().collection('deliveryProviderCallbacks').doc(key));
 const config=callbackSchema.parse(row.data());if(!config.active)throw new Error('callback_unavailable');
 const location=await tx.get(getAdminDb().collection('locations').doc(config.locationId));
 if(!location.exists||location.data()?.brandId!==config.brandId)throw new Error('callback_scope');
 const binding=await loadWoltBindingInTransaction(tx,{brandId:config.brandId,locationId:config.locationId},config.environment);
 if(binding.merchantId!==config.merchantId||binding.venueId!==config.venueId||binding.revision!==config.bindingRevision)throw new Error('callback_unavailable');
 const merchant=await loadWoltMerchantInTransaction(tx,config.environment,config.merchantId);
 if(merchant.callbackId!==key||merchant.brandId!==config.brandId||merchant.locationId!==config.locationId||merchant.venueId!==config.venueId)throw new Error('callback_merchant_scope');
 return config;
}
async function bodyBytes(request:Request){
 if(!request.body)throw new WoltWebhookError('invalid_payload');
 const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>WOLT_WEBHOOK_MAX_BYTES){await reader.cancel();throw new WoltWebhookError('payload_too_large');}chunks.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}
/** Verified early events are durable before200, without accepting caller-selected scope or secrets. */
export async function receiveNativeWoltCallback(request:Request,key:string):Promise<Response>{
 if(request.method!=='POST')return new Response(null,{status:405});
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))return new Response(null,{status:415});
 if(!/^[A-Za-z0-9_-]{32,128}$/.test(key))return new Response(null,{status:404});
 if(process.env.ORDERFLY_DELIVERY_CALLBACK_ENABLED!=='true')return new Response(null,{status:503});
 const callbackId=woltCallbackId(key),db=getAdminDb();
 try{
  const before=await db.runTransaction(tx=>currentCallback(tx,callbackId));
  if(before.environment==='production'&&process.env.ORDERFLY_DELIVERY_PRODUCTION_ENABLED!=='true')return new Response(null,{status:503});
  const [version]=await new SecretManagerServiceClient().accessSecretVersion({name:before.signingSecretRef});
  const raw=version.payload?.data;const secret=typeof raw==='string'?Buffer.from(raw,'base64').toString('utf8'):raw?Buffer.from(raw).toString('utf8'):'';
  const event=normalizeWoltEvent(verifyWoltWebhook(await bodyBytes(request),secret),before.merchantId,new Date().toISOString());
  if(event.nativeVenueId!==null&&event.nativeVenueId!==before.venueId)return new Response(null,{status:403});
  const eventId=hash([callbackId,event.dedupeIdentity]),ref=db.collection('deliveryWoltInbox').doc(eventId);
  await db.runTransaction(async tx=>{
   const current=await currentCallback(tx,callbackId);if(!isDeepStrictEqual(before,current))throw new Error('callback_changed');
   const existing=await tx.get(ref);
   if(existing.exists){const prior=existing.data();const {receivedAt:_a,...a}=event;const {receivedAt:_b,...b}=prior!.event??{};if(prior!.callbackId!==callbackId||!isDeepStrictEqual(a,b))throw new Error('event_conflict');return;}
   const referenceKey=woltReferenceId(before.merchantId,event.nativeOrderReference);
   const mapping=await tx.get(db.collection('deliveryProviderReferences').doc(referenceKey));
   const target=referenceSchema.safeParse(mapping.data());
   let replayJob:FirebaseFirestore.DocumentReference|undefined;let replayRevision=0;
   if(target.success&&(['brandId','locationId','merchantId','venueId','environment','bindingRevision'] as const).every(k=>target.data[k]===current[k])&&target.data.nativeOrderReference===event.nativeOrderReference){
    const jobRef=db.collection('deliveryDispatchJobs').doc(target.data.orderId);const job=await tx.get(jobRef);const value=job.data();
    if(value?.state==='booked'&&value.brandId===current.brandId&&value.locationId===current.locationId){
     const revision=value.inboxReplayRevision??0;if(!Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER)throw new Error('invalid_replay_revision');
     replayJob=jobRef;replayRevision=revision+1;
    }
   }
   tx.create(ref,{version:1,callbackId,callbackRevision:before.revision,referenceKey:woltReferenceId(before.merchantId,event.nativeOrderReference),environment:before.environment,event,state:'pending',createdAtMs:Date.now()});
   if(replayJob)tx.update(replayJob,{inboxReplayCursor:null,inboxReplayCompletedAtMs:null,inboxReplayRevision:replayRevision});
  });
  // A failure here leaves the verified pending record available for bounded worker replay.
  await applyNativeWoltInbox(eventId).catch(()=>undefined);
  return new Response(null,{status:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){return new Response(null,{status:e instanceof WoltWebhookError?(e.code==='payload_too_large'?413:400):503});}
}
export async function applyNativeWoltInbox(eventId:string){
 if(!/^[a-f0-9]{64}$/.test(eventId))throw new Error('invalid_event');const db=getAdminDb(),inbox=db.collection('deliveryWoltInbox').doc(eventId);
 return db.runTransaction(async tx=>{
  const row=(await tx.get(inbox)).data();if(!row||!['pending','reconciliation_required'].includes(row.state))return 'unchanged';
  const callback=await currentCallback(tx,row.callbackId);if(callback.revision!==row.callbackRevision||callback.environment!==row.environment)throw new Error('callback_changed');
  const event=row.event as NormalizedWoltEvent;
  if(row.referenceKey!==woltReferenceId(callback.merchantId,event.nativeOrderReference)||event.nativeVenueId!==null&&event.nativeVenueId!==callback.venueId)throw new Error('event_scope');
  const mapped=await tx.get(db.collection('deliveryProviderReferences').doc(row.referenceKey));if(!mapped.exists)return retainUnmappedWoltReconciliation(tx,{eventId,inboxRef:inbox,callback,event});
  const target=referenceSchema.parse(mapped.data());
  for(const k of ['brandId','locationId','merchantId','venueId','environment','bindingRevision'] as const)if(target[k]!==callback[k])throw new Error('event_scope');
  if(target.nativeOrderReference!==event.nativeOrderReference)throw new Error('event_scope');
  const orderRef=db.collection('orders').doc(target.orderId);
  const [orderDoc,attemptDoc,currentDoc,etaDoc,priorLog,reviewDoc]=await Promise.all([tx.get(orderRef),tx.get(orderRef.collection('deliveryAttempts').doc('original')),tx.get(orderRef.collection('deliveryState').doc('current')),tx.get(orderRef.collection('deliveryEstimates').doc('current')),tx.get(orderRef.collection('deliveryEvents').doc(eventId)),tx.get(orderRef.collection('deliveryReconciliation').doc('original'))]);
  const order=orderDoc.data(),attempt=bookingIntentSchema.parse(attemptDoc.data());
  if(!order||order.brandId!==target.brandId||order.locationId!==target.locationId||order.deliveryType!=='Delivery'||order.managedDelivery?.providerId!=='wolt'||order.managedDelivery.requestDigest!==attempt.requestDigest||attempt.provider!=='wolt'||attempt.reference!==hash(['delivery-original-v1',target.brandId,target.locationId,target.orderId])||attempt.state!=='booked'||attempt.providerDeliveryId!==target.providerDeliveryId||attempt.scope.orderId!==target.orderId||attempt.scope.brandId!==target.brandId||attempt.scope.locationId!==target.locationId)throw new Error('event_scope');
  const base={brandId:target.brandId,locationId:target.locationId,orderId:target.orderId,provider:'wolt',providerDeliveryId:target.providerDeliveryId};
  const current=currentDoc.exists?deliveryEventSnapshotSchema.parse(currentDoc.data()):{...base,status:'booked' as const,occurredAt:null,sequence:null,nativeStatus:'booking.accepted'};
  for(const k of ['brandId','locationId','orderId','provider','providerDeliveryId'] as const)if(current[k]!==base[k])throw new Error('event_scope');
  let decision='eta_only_retained';
  if(event.status!==null){const planned=planVerifiedDeliveryEvent(current,{...base,status:event.status,occurredAt:null,sequence:null,nativeStatus:event.rawStatus,eventId,receivedAt:Date.parse(event.receivedAt)});decision=planned.action;if(planned.action==='apply')tx.set(orderRef.collection('deliveryState').doc('current'),planned.snapshot);}
  if(event.requiresReconciliation)decision='reconcile';
  const priorEta=etaDoc.data();if(priorEta)for(const k of ['brandId','locationId','orderId','provider','providerDeliveryId'] as const)if(priorEta[k]!==base[k])throw new Error('event_scope');const dispatched=Date.parse(event.dispatchedAt);
  if(Number.isFinite(dispatched)&&(!priorEta||dispatched>priorEta.dispatchedAtMs)){
   tx.set(orderRef.collection('deliveryEstimates').doc('current'),{...base,dispatchedAtMs:dispatched,pickup:priorEta?.pickupReliable&&event.pickupEstimateReliable!==true?priorEta.pickup:(event.pickupEstimate??priorEta?.pickup??null),dropoff:event.dropoffEstimate??priorEta?.dropoff??null,pickupReliable:event.pickupEstimateReliable===true||priorEta?.pickupReliable===true,source:event.rawStatus});
  }
  if(!priorLog.exists)tx.create(orderRef.collection('deliveryEvents').doc(eventId),{event:verifiedDeliveryEventSchema.parse({version:1,providerId:'wolt',providerDeliveryId:target.providerDeliveryId,eventRef:eventId,scope:{brandId:target.brandId,locationId:target.locationId},status:event.status,nativeStatus:event.rawStatus,occurredAt:null,receivedAt:event.receivedAt,dispatchedAt:event.dispatchedAt,sequence:null,pickupInterval:event.pickupEstimate,deliveryInterval:event.dropoffEstimate,pickupEstimateProvenance:event.pickupEstimate?{source:event.rawStatus,reliability:event.pickupEstimateReliable===true?'verified_update':'preliminary',observedAt:event.dispatchedAt}:null,nativeErrorCode:null}),decision});
  const review=reviewDoc.data();
  if(decision!=='reconcile'&&review?.state==='operator_review_required'&&review.reason==='provider_delivery_id_unavailable'&&review.brandId===target.brandId&&review.locationId===target.locationId&&review.orderId===target.orderId&&review.attemptRef===attempt.reference&&review.requestDigest===attempt.requestDigest&&review.nativeOrderReference===target.nativeOrderReference){
   tx.update(orderRef.collection('deliveryReconciliation').doc('original'),{state:'resolved_by_accepted_result',providerDeliveryId:target.providerDeliveryId,resolvedAtMs:Date.now()});
   tx.update(orderRef,{deliveryReconciliationRequired:false});
  }
  tx.update(inbox,{state:decision==='reconcile'?'reconciliation_required':'applied',appliedAtMs:Date.now()});
  return decision;
 });
}
export async function replayWoltInboxForReference(merchantId:string,nativeOrderReference:string,environmentInput:'sandbox'|'production',cursor?:string){
 id.parse(merchantId);native.parse(nativeOrderReference);environment.parse(environmentInput);if(cursor&&!/^[a-f0-9]{64}$/.test(cursor))throw new Error('invalid_cursor');
 let query=getAdminDb().collection('deliveryWoltInbox').where('referenceKey','==',woltReferenceId(merchantId,nativeOrderReference)).orderBy('__name__').limit(25);if(cursor)query=query.startAfter(cursor);
 const page=await query.get();for(const doc of page.docs){if(doc.data().environment===environmentInput)await applyNativeWoltInbox(doc.id);}
 return {nextCursor:page.docs.length===25?page.docs[page.docs.length-1].id:null};
}
