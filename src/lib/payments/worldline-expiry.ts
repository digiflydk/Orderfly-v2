import 'server-only';
import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { readPinnedWorldlineAgreement } from './worldline-store';
import { readWorldlineTransaction } from './worldline-client';
import { assertWorldlineTransaction } from './worldline-verification';
import { runWorldlineOperation } from './worldline-operations';
import { releaseDiscount } from '@/lib/discount-reservations';

const id=(value:string)=>/^[A-Za-z0-9_-]{1,128}$/.test(value);
const sessionToken=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);

/** Europe Checkout DELETE is a terminal session-state change, never a money operation.
 * Success means the hosted window is expired. A lost response retains the local lock;
 * repeating this same DELETE cannot create another payment or capture funds.
 */
export async function expireWorldlineSession(credentials:{merchantNumber:string;accessToken:string;secretToken:string},token:string):Promise<boolean>{
  if(!sessionToken(token))throw Error('Invalid checkout session');
  try{
    const response=await fetch(`https://api.v1.checkout.bambora.com/sessions/${token}`,{method:'DELETE',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{Authorization:`Basic ${Buffer.from(`${credentials.accessToken}@${credentials.merchantNumber}:${credentials.secretToken}`).toString('base64')}`,Accept:'application/json'}});
    if(!response.ok)return false;
    const body=await response.json();return body?.meta?.result===true;
  }catch{return false;}
}
function scopeMatches(order:Record<string,any>,binding:{owner:{brandId:string;locationId?:string}}){
  return binding.owner.brandId===order.brandId&&(!binding.owner.locationId||binding.owner.locationId===order.locationId);
}
/** Shared after a verified authorization delete. Never claims cancellation from browser return alone. */
export async function finalizeWorldlineVoid(orderId:string,transactionId:string){
  if(!id(orderId)||!/^\d{1,32}$/.test(transactionId))throw Error('Invalid payment reference');
  const db=getAdminDb(),ref=db.collection('orders').doc(orderId);
  const scope=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),order=snap.data();
    if(!order||order.psp?.provider!=='worldline'||order.psp.transactionId!==transactionId||order.psp.voided!==true||order.paymentOperation||order.paymentStatus==='Paid')throw Error('Unverified payment cancellation');
    if(!order.brandId||!order.locationId)throw Error('Invalid cancellation scope');
    tx.update(ref,{status:'Canceled',cancellationReason:'worldline_authorization_voided'});
    return {brandId:order.brandId as string,locationId:order.locationId as string,sessionId:order.psp.checkoutSessionId as string|undefined};
  });
  await releaseDiscount(orderId,scope.brandId,scope.sessionId,scope.locationId);
}
/** Called only behind a validated guest cancel capability or authenticated stale-hold worker. */
export async function cancelWorldlineCheckout(orderId:string):Promise<'canceled'|'paid'|'unknown'>{
  if(!id(orderId))throw Error('Invalid order');
  const db=getAdminDb(),ref=db.collection('orders').doc(orderId),initial=(await ref.get()).data();
  if(!initial||initial.psp?.provider!=='worldline'||!sessionToken(initial.psp.checkoutSessionId))throw Error('Worldline checkout unavailable');
  if(initial.paymentStatus==='Paid')return 'paid';
  const {binding,credentials}=await readPinnedWorldlineAgreement(initial.paymentAgreement);
  if(!scopeMatches(initial,binding))throw Error('Invalid payment scope');
  if(initial.psp.voided&&initial.psp.transactionId){await finalizeWorldlineVoid(orderId,initial.psp.transactionId);return 'canceled';}
  const marker='session-expiry:'+createHash('sha256').update(initial.psp.checkoutSessionId).digest('hex');
  if(initial.psp.transactionId&&!initial.managedDelivery&&initial.paymentOperation!==marker){
    const result=await runWorldlineOperation({orderId,transactionId:initial.psp.transactionId,requestId:'customer-cancel',operation:'delete',actorId:'receipt-cancel'});
    if(result.state!=='confirmed')return 'unknown';
    await finalizeWorldlineVoid(orderId,initial.psp.transactionId);return 'canceled';
  }
  if(initial.managedDelivery&&initial.psp.transactionId){
    const transaction=assertWorldlineTransaction(await readWorldlineTransaction(credentials,binding.mode,initial.psp.transactionId),{transactionId:initial.psp.transactionId,orderId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor:Math.round(initial.totalAmount*100),currency:'DKK'});
    if(transaction.total.captured>0)return 'paid';
  }
  const claim=await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data();
    if(!current||current.psp?.provider!=='worldline'||current.psp.checkoutSessionId!==initial.psp.checkoutSessionId||JSON.stringify(current.paymentAgreement)!==JSON.stringify(initial.paymentAgreement))throw Error('Checkout agreement changed');
    if(current.paymentStatus==='Paid')return 'paid';
    if(current.psp.transactionId&&!current.managedDelivery&&current.paymentOperation!==marker)return 'transaction';
    if(current.psp.sessionExpired===true&&current.status==='Canceled')return 'expired';
    if((current.paymentRevision??0)!==(initial.paymentRevision??0))throw Error('Payment state changed');
    if(current.paymentOperation&&current.paymentOperation!==marker)throw Error('Payment operation is in progress');
    tx.update(ref,{paymentOperation:marker,'psp.sessionExpiryState':'requesting'});return 'claimed';
  });
  if(claim==='paid')return 'paid';
  if(claim==='transaction')return cancelWorldlineCheckout(orderId);
  if(claim==='expired'){await releaseDiscount(orderId,initial.brandId,initial.psp.checkoutSessionId,initial.locationId);return 'canceled';}
  if(!await expireWorldlineSession(credentials,initial.psp.checkoutSessionId))return 'unknown';
  const result=await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data();
    if(!current||current.psp?.checkoutSessionId!==initial.psp.checkoutSessionId||JSON.stringify(current.paymentAgreement)!==JSON.stringify(initial.paymentAgreement))throw Error('Checkout agreement changed');
    if(current.paymentStatus==='Paid')return 'paid';
    if(current.psp.sessionExpired===true&&current.status==='Canceled')return 'canceled';
    if(current.paymentOperation!==marker)throw Error('Cancellation lock changed');
    // A callback may link its authorization while expiry is in progress. Capture
    // remains locked. Commit Canceled before clearing the lock so that late auth
    // is voided by the durable callback worker rather than captured.
    tx.update(ref,{paymentOperation:null,paymentRevision:(current.paymentRevision??0)+1,status:'Canceled',cancellationReason:'worldline_session_expired','psp.sessionExpired':true,'psp.sessionExpiryState':'confirmed'});
    return 'canceled';
  });
  if(result==='paid')return 'paid';
  await releaseDiscount(orderId,initial.brandId,initial.psp.checkoutSessionId,initial.locationId);
  return 'canceled';
}
