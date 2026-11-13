import 'server-only';
import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { readPinnedWorldlineAgreement } from './worldline-store';
import { runWorldlineOperation } from './worldline-operations';
import { worldlineExpiryDiagnostic } from './worldline-response-diagnostics';
import { releaseDiscount, reservationReleaseIdentity, sameReservationReleaseIdentity, type ReservationReleaseIdentity } from '@/lib/discount-reservations';

const id=(value:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(value);
const sessionToken=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
export const worldlineCancellationCode = (value: unknown): value is string =>
  typeof value === 'string' && /^WORLDLINE_CANCEL_[A-Z0-9_]{1,96}$/.test(value);
type ExpiryResult = { expired: true } | { expired: false; code: string };

async function requestSessionExpiry(credentials:{merchantNumber:string;accessToken:string;secretToken:string},token:string):Promise<ExpiryResult>{
  if(!sessionToken(token))throw Error('Invalid checkout session');
  let response: Response;
  try {
    response=await fetch(`https://api.v1.checkout.bambora.com/sessions/${token}`,{method:'DELETE',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{Authorization:`Basic ${Buffer.from(`${credentials.accessToken}@${credentials.merchantNumber}:${credentials.secretToken}`).toString('base64')}`,Accept:'application/json'}});
  } catch { return {expired:false,code:'WORLDLINE_CANCEL_EXPIRY_NETWORK_OR_TIMEOUT'}; }
  let body: unknown;
  try { body = await response.json(); } catch {
    return {expired:false,code:response.ok?'WORLDLINE_CANCEL_EXPIRY_INVALID_RESPONSE':`WORLDLINE_CANCEL_EXPIRY_HTTP_${Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:'UNKNOWN'}`};
  }
  // Provider action codes are unique only within their source. A static code
  // lookup adds bounded support diagnostics, never cancellation authority.
  if(!response.ok)return {expired:false,code:`WORLDLINE_CANCEL_EXPIRY_HTTP_${Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:'UNKNOWN'}${await worldlineExpiryDiagnostic(credentials,body)}`};
  if((body as {meta?:{result?:unknown}})?.meta?.result!==true)return {expired:false,code:`WORLDLINE_CANCEL_EXPIRY_REJECTED${await worldlineExpiryDiagnostic(credentials,body)}`};
  return {expired:true};
}

/** Europe Checkout DELETE is a terminal session-state change, never a money operation.
 * Success means the hosted window is expired. A lost response retains the local lock;
 * repeating this same DELETE cannot create another payment or capture funds.
 */
export async function expireWorldlineSession(credentials:{merchantNumber:string;accessToken:string;secretToken:string},token:string):Promise<boolean>{
  return (await requestSessionExpiry(credentials,token)).expired;
}
function scopeMatches(order:Record<string,any>,binding:{owner:{brandId:string;locationId?:string}}){
  return binding.owner.brandId===order.brandId&&(!binding.owner.locationId||binding.owner.locationId===order.locationId);
}
function unchanged(current:Record<string,any>|undefined,initial:Record<string,any>):current is Record<string,any>{
  return !!current && current.brandId===initial.brandId && current.locationId===initial.locationId
    && current.customerDetails?.id===initial.customerDetails?.id
    && (current.appliedDiscountId||null)===(initial.appliedDiscountId||null)
    && (current.firstTimeReservation??false)===(initial.firstTimeReservation??false)
    && current.totalAmount===initial.totalAmount && current.paymentMethod===initial.paymentMethod
    && current.psp?.provider==='worldline' && current.psp.checkoutSessionId===initial.psp.checkoutSessionId
    && (!initial.psp.transactionId || current.psp.transactionId===initial.psp.transactionId)
    && JSON.stringify(current.paymentAgreement)===JSON.stringify(initial.paymentAgreement);
}
class CancellationCapacityError extends Error {
  constructor(readonly code:'WORLDLINE_CANCEL_CAPACITY_IDENTITY_UNAVAILABLE'|'WORLDLINE_CANCEL_CAPACITY_IDENTITY_CHANGED') { super('Cancellation capacity identity requires reconciliation'); }
}
function capacityMatches(orderId:string,current:Record<string,any>,capacity:ReservationReleaseIdentity|undefined){
  if(!capacity)return current.discountReservation!=='held';
  return sameReservationReleaseIdentity(current.psp?.cancellationCapacity,capacity)
    && sameReservationReleaseIdentity(capacity,reservationReleaseIdentity(orderId,current));
}
/** Server-only plumbing. Call only AFTER cancel-capability/admin authorization.
 * Capture reservation ownership before the first provider operation, never from
 * a later mutable retry or an already canceled historical held order. */
export async function prepareWorldlineCancellationCapacity(orderId:string,expected?:Record<string,any>):Promise<ReservationReleaseIdentity|undefined>{
  if(!id(orderId))throw Error('Invalid order');
  const db=getAdminDb(),ref=db.collection('orders').doc(orderId);
  return db.runTransaction(async tx=>{
    const order=(await tx.get(ref)).data();
    if(!order||order.paymentMethod!=='Worldline'||order.psp?.provider!=='worldline'||!scopeMatches(order,order.paymentAgreement)
      ||expected&&!unchanged(order,expected))throw Error('Cancellation scope changed');
    if(order.paymentStatus==='Paid'||order.discountReservation!=='held')return undefined;
    let identity:ReservationReleaseIdentity;
    try{identity=reservationReleaseIdentity(orderId,order);}catch{throw new CancellationCapacityError('WORLDLINE_CANCEL_CAPACITY_IDENTITY_UNAVAILABLE');}
    if(order.psp.cancellationCapacity!==undefined){
      if(!sameReservationReleaseIdentity(order.psp.cancellationCapacity,identity))throw new CancellationCapacityError('WORLDLINE_CANCEL_CAPACITY_IDENTITY_CHANGED');
      return identity;
    }
    if(order.status==='Canceled'||order.psp.sessionExpired===true||order.psp.voided===true
      ||order.psp.sessionExpiryState!==undefined||order.paymentOperation)
      throw new CancellationCapacityError('WORLDLINE_CANCEL_CAPACITY_IDENTITY_UNAVAILABLE');
    tx.update(ref,{'psp.cancellationCapacity':identity});return identity;
  });
}
/** Unknown means preserve the financial lock and capacity. Bring the original
 * authenticated recovery job forward; never create another checkout/payment. */
async function pendingCancellation(orderId:string,initial:Record<string,any>,code:string):Promise<'paid'|'canceled'|'unknown'>{
  const db=getAdminDb(),ref=db.collection('orders').doc(orderId),job=db.collection('worldlineCheckoutExpiryJobs').doc(orderId);
  return db.runTransaction(async tx=>{
    const [snap,previous]=await Promise.all([tx.get(ref),tx.get(job)]),current=snap.data();
    if(!unchanged(current,initial))throw Error('Checkout agreement changed');
    if(current!.paymentStatus==='Paid')return 'paid';
    if(current.status==='Canceled'&&current.discountReservation==='released'&&!current.paymentOperation&&(current.psp.sessionExpired===true||current.psp.voided===true))return 'canceled';
    const now=Date.now(),prior=previous.data();
    if(previous.exists&&(prior?.orderId!==orderId||prior.brandId!==initial.brandId||prior.locationId!==initial.locationId))throw Error('Cancellation recovery scope mismatch');
    tx.update(ref,{'psp.cancellationErrorCode':worldlineCancellationCode(code)?code:'WORLDLINE_CANCEL_UNAVAILABLE'});
    tx.set(job,{orderId,brandId:initial.brandId,locationId:initial.locationId,
      nextAttemptAt:Math.min(typeof prior?.nextAttemptAt==='number'?prior.nextAttemptAt:Infinity,now+15000),
      attempts:prior?.attempts??0,createdAt:prior?.createdAt??now,state:'reconciliation_required',updatedAt:now},{merge:true});
    return 'unknown';
  });
}
/** Shared after a verified authorization delete. Never claims cancellation from browser return alone. */
export async function finalizeWorldlineVoid(orderId:string,transactionId:string,expected?:Record<string,any>){
  if(!id(orderId)||!/^\d{1,32}$/.test(transactionId))throw Error('Invalid payment reference');
  const db=getAdminDb(),ref=db.collection('orders').doc(orderId);
  const scope=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),order=snap.data();
    if(!order||order.psp?.provider!=='worldline'||order.psp.transactionId!==transactionId||order.psp.voided!==true||order.psp.captured===true||order.paymentOperation||order.paymentStatus==='Paid')throw Error('Unverified payment cancellation');
    if(!scopeMatches(order,order.paymentAgreement)||expected&&!unchanged(order,expected))throw Error('Cancellation scope changed');
    if(!order.brandId||!order.locationId)throw Error('Invalid cancellation scope');
    let capacity:ReservationReleaseIdentity|undefined;
    if(order.discountReservation==='held'){
      capacity=reservationReleaseIdentity(orderId,order);
      if(!sameReservationReleaseIdentity(order.psp.cancellationCapacity,capacity))throw new CancellationCapacityError('WORLDLINE_CANCEL_CAPACITY_IDENTITY_UNAVAILABLE');
    }
    tx.update(ref,{status:'Canceled',cancellationReason:'worldline_authorization_voided','psp.cancellationErrorCode':null});
    return {brandId:order.brandId as string,locationId:order.locationId as string,sessionId:order.psp.checkoutSessionId as string|undefined,capacity};
  });
  await releaseDiscount(orderId,scope.brandId,scope.sessionId,scope.locationId,scope.capacity);
}
/** Called only behind a validated guest cancel capability or authenticated stale-hold worker. */
export async function cancelWorldlineCheckout(orderId:string):Promise<'canceled'|'paid'|'unknown'>{
  if(!id(orderId))throw Error('Invalid order');
  const db=getAdminDb(),ref=db.collection('orders').doc(orderId),initial=(await ref.get()).data();
  if(!initial||initial.paymentMethod!=='Worldline'||initial.psp?.provider!=='worldline')throw Error('Worldline checkout unavailable');
  if(initial.paymentStatus==='Paid')return 'paid';
  const {binding,credentials}=await readPinnedWorldlineAgreement(initial.paymentAgreement);
  if(!scopeMatches(initial,binding))throw Error('Invalid payment scope');
  if(initial.status==='Canceled'&&initial.paymentStatus==='Failed'&&initial.discountReservation==='released'&&!initial.paymentOperation&&(initial.psp.sessionExpired===true||initial.psp.voided===true))return 'canceled';
  let capacity:ReservationReleaseIdentity|undefined;
  try{capacity=await prepareWorldlineCancellationCapacity(orderId,initial);}catch(error){
    if(error instanceof CancellationCapacityError)return pendingCancellation(orderId,initial,error.code);
    throw error;
  }
  if(initial.psp.voided&&initial.psp.transactionId){await finalizeWorldlineVoid(orderId,initial.psp.transactionId,initial);return 'canceled';}
  const marker=sessionToken(initial.psp.checkoutSessionId)?'session-expiry:'+createHash('sha256').update(initial.psp.checkoutSessionId).digest('hex'):undefined;
  if(initial.psp.transactionId){
    const {readWorldlineTransaction}=await import('./worldline-client');
    const {assertWorldlineTransaction}=await import('./worldline-verification');
    let transaction;
    try {
      transaction=assertWorldlineTransaction(await readWorldlineTransaction(credentials,binding.mode,initial.psp.transactionId),{transactionId:initial.psp.transactionId,orderId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor:Math.round(initial.totalAmount*100),currency:'DKK'});
    } catch { return pendingCancellation(orderId,initial,'WORLDLINE_CANCEL_TRANSACTION_UNAVAILABLE'); }
    if(transaction.status.toLowerCase()==='approved'&&transaction.total.captured===Math.round(initial.totalAmount*100)&&transaction.total.credited===0){
      await db.runTransaction(async tx=>{
        const current=(await tx.get(ref)).data();
        if(!unchanged(current,initial)||current.psp.transactionId!==initial.psp.transactionId)throw Error('Payment state changed');
      });
      return 'paid';
    }
    if(transaction.total.captured>0||transaction.total.credited>0)return pendingCancellation(orderId,initial,'WORLDLINE_CANCEL_CAPTURE_REQUIRES_RECONCILIATION');
    // A server observation of the original deleted authorization is sufficient
    // to finish a prior successful void without another financial POST. Never
    // clear another operation's lock on this observation path.
    if(transaction.status.toLowerCase()==='deleted'&&!initial.paymentOperation&&initial.psp.captured!==true){
      await db.runTransaction(async tx=>{
        const current=(await tx.get(ref)).data();
        if(!unchanged(current,initial)||!capacityMatches(orderId,current,capacity)||current.psp.transactionId!==initial.psp.transactionId||current.psp.captured===true||current.paymentOperation||current.paymentStatus==='Paid'||(current.paymentRevision??0)!==(initial.paymentRevision??0))throw Error('Payment state changed');
        tx.update(ref,{'psp.voided':true,paymentRevision:(current.paymentRevision??0)+1});
      });
      await finalizeWorldlineVoid(orderId,initial.psp.transactionId,initial);return 'canceled';
    }
    if(transaction.status.toLowerCase()!=='approved'&&transaction.status.toLowerCase()!=='deleted')return pendingCancellation(orderId,initial,'WORLDLINE_CANCEL_TRANSACTION_NOT_AUTHORIZED');
  }
  if(initial.psp.transactionId&&!initial.managedDelivery&&(marker===undefined||initial.paymentOperation!==marker)){
    const result=await runWorldlineOperation({orderId,transactionId:initial.psp.transactionId,requestId:'customer-cancel',operation:'delete',actorId:'receipt-cancel'});
    if(result.state!=='confirmed')return pendingCancellation(orderId,initial,'WORLDLINE_CANCEL_VOID_PENDING');
    await finalizeWorldlineVoid(orderId,initial.psp.transactionId,initial);return 'canceled';
  }
  if(initial.managedDelivery&&initial.psp.transactionId&&marker===undefined){
    const {cancelManagedWorldlineAuthorization}=await import('@/lib/delivery/payments/worldline-operation-authority');
    const result=await cancelManagedWorldlineAuthorization(orderId,initial.psp.transactionId);
    if(result.state!=='confirmed')return pendingCancellation(orderId,initial,'WORLDLINE_CANCEL_VOID_PENDING');
    await finalizeWorldlineVoid(orderId,initial.psp.transactionId,initial);return 'canceled';
  }
  if(!sessionToken(initial.psp.checkoutSessionId))throw Error('Worldline session requires reconciliation');
  const claim=await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data();
    if(!unchanged(current,initial)||!capacityMatches(orderId,current,capacity))throw Error('Checkout agreement changed');
    if(current.paymentStatus==='Paid')return 'paid';
    if(current.psp.transactionId&&!current.managedDelivery&&current.paymentOperation!==marker)return 'transaction';
    if(current.psp.sessionExpired===true&&current.status==='Canceled')return 'expired';
    if((current.paymentRevision??0)!==(initial.paymentRevision??0))throw Error('Payment state changed');
    if(current.paymentOperation&&current.paymentOperation!==marker)throw Error('Payment operation is in progress');
    tx.update(ref,{paymentOperation:marker,'psp.sessionExpiryState':'requesting'});return 'claimed';
  });
  if(claim==='paid')return 'paid';
  if(claim==='transaction')return cancelWorldlineCheckout(orderId);
  if(claim==='expired'){await releaseDiscount(orderId,initial.brandId,initial.psp.checkoutSessionId,initial.locationId,capacity);return 'canceled';}
  const expiry=await requestSessionExpiry(credentials,initial.psp.checkoutSessionId);
  if(!expiry.expired)return pendingCancellation(orderId,initial,expiry.code);
  const result=await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data();
    if(!unchanged(current,initial)||!capacityMatches(orderId,current,capacity))throw Error('Checkout agreement changed');
    if(current.paymentStatus==='Paid')return 'paid';
    if(current.psp.sessionExpired===true&&current.status==='Canceled')return 'canceled';
    if(current.paymentOperation!==marker)throw Error('Cancellation lock changed');
    // A callback may link its authorization while expiry is in progress. Capture
    // remains locked. Commit Canceled before clearing the lock so that late auth
    // is voided by the durable callback worker rather than captured.
    tx.update(ref,{paymentOperation:null,paymentRevision:(current.paymentRevision??0)+1,status:'Canceled',cancellationReason:'worldline_session_expired','psp.sessionExpired':true,'psp.sessionExpiryState':'confirmed','psp.cancellationErrorCode':null});
    return 'canceled';
  });
  if(result==='paid')return 'paid';
  await releaseDiscount(orderId,initial.brandId,initial.psp.checkoutSessionId,initial.locationId,capacity);
  return 'canceled';
}
