import 'server-only';
import { createHash } from 'node:crypto';
import { captureManagedWorldlineOrder, cancelManagedWorldlineAuthorization } from '@/lib/delivery/payments/worldline-operation-authority';
import { getAdminDb } from '@/lib/firebase-admin';
import { readPinnedWorldlineAgreement } from './worldline-store';
import { readWorldlineTransaction } from './worldline-client';
import { assertWorldlineTransaction } from './worldline-verification';
import { runWorldlineOperation } from './worldline-operations';
import { settleWorldlineOrder } from '@/lib/server/settle-checkout';

/** An early authorization callback is not evidence that provider-side capture completed. */
export class WorldlineCapturePendingError extends Error {
  readonly code = 'worldline_capture_pending';
  constructor() { super('Worldline capture is not complete'); this.name = 'WorldlineCapturePendingError'; }
}

/** Jobs remain durable until the authoritative settlement (including print) commits. */
export async function reconcileWorldlineOrder(orderId:string){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(orderId))throw Error('Invalid order');
  const db=getAdminDb(),ref=db.collection('orders').doc(orderId),job=db.collection('worldlinePaymentJobs').doc(orderId);
  const order=(await ref.get()).data();
  if(!order||order.psp?.provider!=='worldline'||!order.psp.transactionId)throw Error('Worldline order unavailable');
  const captureMode=order.psp.captureMode;
  if(captureMode!==undefined && captureMode!=='provider_instant')throw Error('Unknown Worldline capture mode');
  const {binding,credentials}=await readPinnedWorldlineAgreement(order.paymentAgreement);
  if(binding.owner.brandId!==order.brandId||binding.owner.locationId&&binding.owner.locationId!==order.locationId)throw Error('Worldline scope mismatch');
  const transactionId=order.psp.transactionId,amountMinor=Math.round(order.totalAmount*100);
  const transaction=assertWorldlineTransaction(await readWorldlineTransaction(credentials,binding.mode,transactionId),{orderId,transactionId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor,currency:'DKK'});
  if(transaction.total.credited!==0)throw Error('Payment requires operator reconciliation');
  if(order.status==='Canceled'){
    if((order.psp.sessionExpired!==true&&order.cancellationReason!=='worldline_authorization_cancel_requested'&&!(order.psp.voided===true&&transaction.status.toLowerCase()==='deleted'))||transaction.total.captured!==0)throw Error('Canceled payment requires operator reconciliation');
    const voidJournal=createHash('sha256').update('canceled-authorization').digest('hex');
    if(transaction.status.toLowerCase()==='approved'||order.paymentOperation===voidJournal){
      const result=order.managedDelivery?await cancelManagedWorldlineAuthorization(orderId,transactionId):await runWorldlineOperation({orderId,transactionId,requestId:'canceled-authorization',operation:'delete',actorId:'worldline-worker'});
      if(result.state!=='confirmed')throw Error('Cancellation requires reconciliation');
    }else if(transaction.status.toLowerCase()!=='deleted')throw Error('Cancellation is not confirmed');
    await job.set({state:'canceled',nextAttemptAt:8640000000000000,updatedAt:Date.now()},{merge:true});return;
  }
  if(transaction.status.toLowerCase()!=='approved')throw Error('Payment is not authorized');
  if(captureMode==='provider_instant'){
    // The hosted session owns capture. Its authorization callback can arrive first;
    // a second capture here would race Worldline and could charge twice.
    if(order.paymentOperation)throw Error('Another operation requires reconciliation');
    if(transaction.total.captured!==amountMinor)throw new WorldlineCapturePendingError();
  }else{
    // Existing authorization-only sessions retain their original server capture journal.
    const captureJournal=createHash('sha256').update('initial-capture').digest('hex');
    if(order.paymentOperation&&order.paymentOperation!==captureJournal)throw Error('Another operation requires reconciliation');
    if(transaction.total.captured!==amountMinor||order.paymentOperation===captureJournal){
      const result=order.managedDelivery?await captureManagedWorldlineOrder(orderId):await runWorldlineOperation({orderId,transactionId,requestId:'initial-capture',operation:'capture',amountMinor,actorId:'worldline-worker'});
      if(result.state!=='confirmed')throw Error('Capture requires reconciliation');
    }
  }
  await settleWorldlineOrder(orderId,transactionId);
  await job.set({orderId,brandId:order.brandId,locationId:order.locationId,transactionId,state:'settled',nextAttemptAt:8640000000000000,updatedAt:Date.now()},{merge:true});
}
export async function processWorldlineJobs(){
  const db=getAdminDb(),now=Date.now();
  // Single-field due ordering needs no compound index and cannot starve later jobs behind poison messages.
  const jobs=await db.collection('worldlinePaymentJobs').where('nextAttemptAt','<=',now).orderBy('nextAttemptAt').limit(1).get();
  let settled=0;
  for(const job of jobs.docs){
    if(job.data().state!=='pending'){await job.ref.update({nextAttemptAt:8640000000000000});continue;}
    try{await reconcileWorldlineOrder(job.id);settled++;}catch{
      await db.runTransaction(async tx=>{
        const current=(await tx.get(job.ref)).data();if(!current||current.state!=='pending')return;
        const attempts=Math.min(30,Math.max(0,Number(current.attempts)||0)+1);
        tx.update(job.ref,{attempts,state:'pending',lastAttemptAt:Date.now(),nextAttemptAt:Date.now()+Math.min(60000*2**(attempts-1),3600000),error:'payment_reconciliation_required'});
      });
    }
  }
  return {inspected:jobs.size,settled};
}
