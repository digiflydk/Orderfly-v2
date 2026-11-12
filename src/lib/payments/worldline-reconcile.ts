import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { readPinnedWorldlineAgreement } from './worldline-store';
import { readWorldlineTransaction } from './worldline-client';
import { assertWorldlineTransaction } from './worldline-verification';
import { runWorldlineOperation } from './worldline-operations';
import { settleWorldlineOrder } from '@/lib/server/settle-checkout';

/** Jobs remain durable until the authoritative settlement (including print) commits. */
export async function reconcileWorldlineOrder(orderId:string){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(orderId))throw Error('Invalid order');
  const db=getAdminDb(),ref=db.collection('orders').doc(orderId),job=db.collection('worldlinePaymentJobs').doc(orderId);
  const order=(await ref.get()).data();
  if(!order||order.psp?.provider!=='worldline'||!order.psp.transactionId||order.managedDelivery)throw Error('Worldline order unavailable');
  const {binding,credentials}=await readPinnedWorldlineAgreement(order.paymentAgreement);
  if(binding.owner.brandId!==order.brandId||binding.owner.locationId&&binding.owner.locationId!==order.locationId)throw Error('Worldline scope mismatch');
  const transactionId=order.psp.transactionId,amountMinor=Math.round(order.totalAmount*100);
  const transaction=assertWorldlineTransaction(await readWorldlineTransaction(credentials,binding.mode,transactionId),{orderId,transactionId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor,currency:'DKK'});
  if(transaction.total.credited!==0||order.status==='Canceled')throw Error('Payment requires operator reconciliation');
  if(transaction.status.toLowerCase()!=='approved')throw Error('Payment is not authorized');
  // Match existing automatic Stripe capture; an authorization never becomes Paid.
  if(transaction.total.captured!==amountMinor){
    const result=await runWorldlineOperation({orderId,transactionId,requestId:'initial-capture',operation:'capture',amountMinor,actorId:'worldline-worker'});
    if(result.state!=='confirmed')throw Error('Capture requires reconciliation');
  }
  await settleWorldlineOrder(orderId,transactionId);
  await job.set({orderId,brandId:order.brandId,locationId:order.locationId,transactionId,state:'settled',updatedAt:Date.now()},{merge:true});
}
export async function processWorldlineJobs(){
  const db=getAdminDb();
  const jobs=await db.collection('worldlinePaymentJobs').where('state','==','pending').limit(10).get();
  let settled=0;
  for(const job of jobs.docs.filter(job=>(job.data().nextAttemptAt??0)<=Date.now()).slice(0,1)){try{await reconcileWorldlineOrder(job.id);settled++;}catch{await job.ref.update({lastAttemptAt:Date.now(),nextAttemptAt:Date.now()+60000,error:'payment_reconciliation_required'});}}
  return {inspected:jobs.size,settled};
}
