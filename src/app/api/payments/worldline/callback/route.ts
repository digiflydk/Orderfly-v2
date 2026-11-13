import { after } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { readPinnedWorldlineAgreement } from '@/lib/payments/worldline-store';
import { verifyWorldlineCallback } from '@/lib/payments/worldline-callback';
import { reconcileWorldlineOrder } from '@/lib/payments/worldline-reconcile';
import { waitForWorldlineCallbackFinancialCompletion } from '@/lib/payments/worldline-callback-completion';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const startedAt=Date.now();
  const url=new URL(request.url),orderId=url.searchParams.get('orderid')||'';
  if(url.search.length>16384||!/^[A-Za-z0-9_-]{1,50}$/.test(orderId))return new Response('Invalid callback',{status:400});
  try{
    const db=getAdminDb(),ref=db.collection('orders').doc(orderId),order=(await ref.get()).data();
    if(!order||order.psp?.provider!=='worldline')return new Response('Invalid callback',{status:400});
    const {binding,credentials}=await readPinnedWorldlineAgreement(order.paymentAgreement);
    const callback=verifyWorldlineCallback(url.searchParams,credentials.md5Key);
    if(binding.owner.brandId!==order.brandId||binding.owner.locationId&&binding.owner.locationId!==order.locationId||callback.orderId!==orderId||callback.amountMinor!==Math.round(order.totalAmount*100)||callback.currency!=='DKK')return new Response('Invalid callback',{status:400});
    const job=db.collection('worldlinePaymentJobs').doc(orderId);
    const created=await db.runTransaction(async tx=>{
      const [current,prior]=await Promise.all([tx.get(ref),tx.get(job)]);
      const value=current.data();
      if(!value||value.psp?.provider!=='worldline'||JSON.stringify(value.paymentAgreement)!==JSON.stringify(order.paymentAgreement)||value.psp.transactionId&&value.psp.transactionId!==callback.transactionId)throw Error('Payment conflict');
      if(prior.exists){if(prior.data()?.transactionId!==callback.transactionId)throw Error('Payment conflict');return false;}
      tx.update(ref,{'psp.transactionId':callback.transactionId});
      tx.create(job,{orderId,brandId:order.brandId,locationId:order.locationId,transactionId:callback.transactionId,state:'pending',nextAttemptAt:Date.now(),attempts:0,createdAt:Date.now(),updatedAt:Date.now()});
      return true;
    });
    // Start the original reconciliation once, after durable verified admission.
    // The same work survives the response; duplicate callbacks never start it again.
    const work=created?Promise.resolve().then(()=>reconcileWorldlineOrder(orderId)).catch(()=>{/* Durable worker owns recovery. */}):undefined;
    if(work){try{after(async()=>{await work;});}catch{/* The durable job survives a continuation registration failure. */}}
    // A normal fast financial commit can finish before Worldline releases its
    // browser return. Later managed delivery booking must not hold the callback.
    // Leave margin for the provider's documented five-second instant timeout.
    await waitForWorldlineCallbackFinancialCompletion({expected:{orderId,brandId:order.brandId,locationId:order.locationId,
      transactionId:callback.transactionId,amountMinor:callback.amountMinor,binding},readOrder:async()=>(await ref.get()).data(),work,
      timeoutMs:Math.max(0,Math.min(3500,4500-(Date.now()-startedAt)))});
    // Deadline/error still means durable admission, never a claim that Paid committed.
    return new Response('OK',{headers:{'Cache-Control':'no-store'}});
  }catch{return new Response('Callback unavailable',{status:503});}
}
