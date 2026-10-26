import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { AuthorityError, principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { managedDeliveryBindingSchema, deliveryCreateResultSchema, deliveryCancelResultSchema, type DeliveryCancelResult } from '../provider-contract';
import { bookingIntentSchema } from '../booking/state';
import { loadWoltBindingInTransaction, createOrderOperatorWoltStorage } from '../integrations/wolt-binding';
import { createWoltProvider } from '../providers/wolt/provider';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const cancellationCommandSchema=z.object({brandId:id,locationId:id,orderId:id,requestId:z.string().uuid(),operatorReason:z.string().trim().min(1).max(500)}).strict();
type Command=z.infer<typeof cancellationCommandSchema>;
type Scope=Pick<Command,'brandId'|'locationId'|'orderId'>;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class DeliveryCancellationError extends Error {constructor(readonly code:'invalid_request'|'cancellation_disabled'|'cancellation_conflict'|'not_cancellable'|'cancellation_unavailable',readonly status=409){super(code);}}
export function deliveryCancellationEnabled(environment:unknown):boolean{return process.env.ORDERFLY_DELIVERY_CANCELLATION_ENABLED==='true'&&(environment==='sandbox'||environment==='production'&&process.env.ORDERFLY_DELIVERY_PRODUCTION_ENABLED==='true');}
const states=['submitting','cancelled','not_cancellable','unknown','unsupported'] as const;
type State=typeof states[number];
const savedSchema=z.object({version:z.literal(1),brandId:id,locationId:id,orderId:id,requestId:z.string().uuid(),actorId:z.string(),fingerprint:z.string(),claimId:z.string().uuid(),attemptRef:z.string(),providerDeliveryId:z.string(),environment:z.enum(['sandbox','production']),operatorReason:z.string(),state:z.enum(states),reconcileRequired:z.boolean(),networkStartedAtMs:z.number().nullable(),createdAtMs:z.number(),result:deliveryCancelResultSchema.nullable()}).strict();
const paths=(c:Scope)=>{const order=getAdminDb().collection('orders').doc(c.orderId);return {order,cancel:order.collection('deliveryCancellation').doc('original')};};
async function native(tx:FirebaseFirestore.Transaction,c:Scope,identity:VerifiedIdentity){
 const {order:ref}=paths(c);const order=(await tx.get(ref)).data();
 if(!order||order.brandId!==c.brandId||order.locationId!==c.locationId||order.deliveryType!=='Delivery')throw new AuthorityError('forbidden');
 await authorizeTransaction(tx,identity,order,'orderfly.orders:edit','location');
 const managed=managedDeliveryBindingSchema.parse(order.managedDelivery);
 const [attemptSnap,resultSnap,dispatchSnap,stateSnap]=await Promise.all([tx.get(ref.collection('deliveryAttempts').doc('original')),tx.get(ref.collection('deliveryDispatchResults').doc('original')),tx.get(ref.collection('deliveryDispatch').doc('original')),tx.get(ref.collection('deliveryState').doc('current'))]);
 const attempt=bookingIntentSchema.parse(attemptSnap.data()),record=resultSnap.data(),result=deliveryCreateResultSchema.parse(record?.result),dispatch=dispatchSnap.data(),state=stateSnap.data();
 if(managed.providerId!=='wolt'||attempt.state!=='booked'||attempt.provider!=='wolt'||attempt.scope.orderId!==c.orderId||attempt.scope.brandId!==c.brandId||attempt.scope.locationId!==c.locationId||attempt.requestDigest!==managed.requestDigest||result.kind!=='accepted'||attempt.providerDeliveryId!==result.providerDeliveryId||record?.providerId!=='wolt'||record?.scope?.orderId!==c.orderId||record?.scope?.brandId!==c.brandId||record?.scope?.locationId!==c.locationId||record?.requestDigest!==managed.requestDigest||record?.attemptRef!==attempt.reference||dispatch?.attemptRef!==attempt.reference||dispatch?.requestDigest!==managed.requestDigest||dispatch?.scope?.orderId!==c.orderId||dispatch?.scope?.brandId!==c.brandId||dispatch?.scope?.locationId!==c.locationId)throw new DeliveryCancellationError('not_cancellable');
 const environment=z.enum(['sandbox','production']).parse(dispatch.environment);
 const binding=await loadWoltBindingInTransaction(tx,{brandId:c.brandId,locationId:c.locationId},environment);
 if(binding.merchantId!==dispatch.binding?.merchantId||binding.venueId!==dispatch.binding?.venueId||String(binding.revision)!==dispatch.binding?.bindingRevision)throw new DeliveryCancellationError('cancellation_conflict');
 if(state&&(state.brandId!==c.brandId||state.locationId!==c.locationId||state.orderId!==c.orderId||state.provider!=='wolt'||state.providerDeliveryId!==result.providerDeliveryId))throw new DeliveryCancellationError('cancellation_conflict');
 const pickupStarted=order.status==='Delivered'||!!state&&!['booked','courier_assigned','courier_to_pickup'].includes(state.status);
 return {order,attempt,result,environment,binding,pickupStarted,state};
}
function view(saved:z.infer<typeof savedSchema>,changed=false){return {state:saved.state,changed,feeKnown:saved.result?.kind==='cancelled'&&saved.result.fee!==null};}
async function operation(c:Command,identity:VerifiedIdentity){
 const db=getAdminDb(),refs=paths(c),actorId=principalKey(identity),fingerprint=hash([actorId,c]);
 const claim=await db.runTransaction(async tx=>{
  // Existing result is still protected by current order permission and ownership.
  const order=(await tx.get(refs.order)).data();if(!order||order.brandId!==c.brandId||order.locationId!==c.locationId)throw new AuthorityError('forbidden');
  await authorizeTransaction(tx,identity,order,'orderfly.orders:edit','location');
  const old=await tx.get(refs.cancel);
  if(old.exists){const saved=savedSchema.parse(old.data());if(saved.brandId!==c.brandId||saved.locationId!==c.locationId||saved.orderId!==c.orderId||saved.requestId===c.requestId&&saved.fingerprint!==fingerprint)throw new DeliveryCancellationError('cancellation_conflict');return {saved,fresh:false};}
  const current=await native(tx,c,identity);
  if(!deliveryCancellationEnabled(current.environment))throw new DeliveryCancellationError('cancellation_disabled',503);
  if(current.pickupStarted)throw new DeliveryCancellationError('not_cancellable');
  const saved=savedSchema.parse({version:1,brandId:c.brandId,locationId:c.locationId,orderId:c.orderId,requestId:c.requestId,actorId,fingerprint,claimId:randomUUID(),attemptRef:current.attempt.reference,providerDeliveryId:current.result.providerDeliveryId,environment:current.environment,operatorReason:c.operatorReason,state:'submitting',reconcileRequired:false,networkStartedAtMs:null,createdAtMs:Date.now(),result:null});
  tx.create(refs.cancel,saved);tx.create(refs.cancel.collection('audit').doc('requested'),{...saved,action:'delivery.cancel.requested'});return {saved,fresh:true};
 });
 if(!claim.fresh)return view(claim.saved);
 let result:DeliveryCancelResult;
 try{
  const storage=await createOrderOperatorWoltStorage({brandId:c.brandId,locationId:c.locationId},claim.saved.environment);
  const provider=createWoltProvider({...storage,environment:claim.saved.environment,validateClaimedAttempt:async()=>false,
   loadCancellation:async(scope,attemptRef)=>db.runTransaction(async tx=>{
    const current=await native(tx,c,identity),row=await tx.get(refs.cancel),saved=savedSchema.parse(row.data());
    if(!deliveryCancellationEnabled(current.environment)||scope.brandId!==c.brandId||scope.locationId!==c.locationId||attemptRef!==saved.attemptRef||saved.claimId!==claim.saved.claimId||saved.state!=='submitting'||saved.networkStartedAtMs!==null)throw new DeliveryCancellationError('cancellation_conflict');
    tx.update(refs.cancel,{networkStartedAtMs:Date.now()});
    return {scope:{brandId:c.brandId,locationId:c.locationId},providerDeliveryId:current.result.providerDeliveryId,woltOrderReferenceId:current.result.nativeReference,merchantId:current.binding.merchantId,venueId:current.binding.venueId,environment:current.environment,pickupStarted:current.pickupStarted,pickupCompleted:current.state?.status==='delivered'};
   })});
  result=deliveryCancelResultSchema.parse(await provider.cancel({scope:{brandId:c.brandId,locationId:c.locationId},providerDeliveryId:claim.saved.providerDeliveryId,attemptRef:claim.saved.attemptRef,operatorReason:c.operatorReason,acceptedFee:null,feeQuoteRef:null,feeQuoteRevision:null}));
 }catch{result={kind:'unknown',error:{code:'cancellation_outcome_unknown',messageKey:'delivery.cancellation_outcome_unknown',retry:'after_reconciliation',nativeCode:null}};}
 return db.runTransaction(async tx=>{
  const order=(await tx.get(refs.order)).data(),old=(await tx.get(refs.cancel)).data(),saved=savedSchema.parse(old);
  if(!order||order.brandId!==c.brandId||order.locationId!==c.locationId||saved.claimId!==claim.saved.claimId||saved.fingerprint!==fingerprint)throw new DeliveryCancellationError('cancellation_conflict');
  // Recording observed provider evidence must survive operator revocation after network dispatch.
  if(saved.result!==null)return view(saved);
  const currentState=(await tx.get(refs.order.collection('deliveryState').doc('current'))).data();
  const conflict=result.kind==='cancelled'&&(order.status==='Delivered'||currentState&&['picked_up','delivered'].includes(currentState.status));
  const next={...saved,state:conflict?'unknown' as const:result.kind as State,reconcileRequired:!!conflict,result};
  tx.set(refs.cancel,next);tx.create(refs.cancel.collection('audit').doc('result'),{action:'delivery.cancel.result',claimId:saved.claimId,actorId,recordedAtMs:Date.now(),result});
  // This cancels the courier only. Financial/order cancellation and refunds are separate authorized actions.
  return view(next,true);
 });
}
export async function cancelManagedDelivery(raw:unknown){const identity=await verifiedOrderflyIdentity(),parsed=cancellationCommandSchema.safeParse(raw);if(!parsed.success)throw new DeliveryCancellationError('invalid_request',400);try{return await operation(parsed.data,identity);}catch(e){if(e instanceof AuthorityError||e instanceof DeliveryCancellationError)throw e;throw new DeliveryCancellationError('cancellation_unavailable',503);}}

/** Read-only UI eligibility; final mutation repeats every check in its own transaction. */
export async function cancellationAvailability(raw:unknown):Promise<{available:boolean;reason:string|null}>{
 const identity=await verifiedOrderflyIdentity(),scope=cancellationCommandSchema.omit({requestId:true,operatorReason:true}).parse(raw);
 try{return await getAdminDb().runTransaction(async tx=>{
  const current=await native(tx,scope,identity),existing=await tx.get(paths(scope).cancel);
  if(existing.exists)return {available:false,reason:'cancellation_already_requested'};
  if(!deliveryCancellationEnabled(current.environment))return {available:false,reason:'cancellation_disabled'};
  if(current.pickupStarted)return {available:false,reason:'not_cancellable'};
  return {available:true,reason:null};
 },{readOnly:true});}catch(e){
  if(e instanceof AuthorityError&&e.status===403)return {available:false,reason:'forbidden'};
  return {available:false,reason:'cancellation_unavailable'};
 }
}
