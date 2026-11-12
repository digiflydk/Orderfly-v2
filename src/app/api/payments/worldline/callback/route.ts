import { after } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { readPinnedWorldlineAgreement } from '@/lib/payments/worldline-store';
import { verifyWorldlineCallback } from '@/lib/payments/worldline-callback';
import { reconcileWorldlineOrder } from '@/lib/payments/worldline-reconcile';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const url=new URL(request.url),orderId=url.searchParams.get('orderid')||'';
  if(url.search.length>16384||!/^[A-Za-z0-9_-]{1,50}$/.test(orderId))return new Response('Invalid callback',{status:400});
  try{
    const db=getAdminDb(),ref=db.collection('orders').doc(orderId),order=(await ref.get()).data();
    if(!order||order.psp?.provider!=='worldline')return new Response('Invalid callback',{status:400});
    const {binding,credentials}=await readPinnedWorldlineAgreement(order.paymentAgreement);
    const callback=verifyWorldlineCallback(url.searchParams,credentials.md5Key);
    if(binding.owner.brandId!==order.brandId||binding.owner.locationId&&binding.owner.locationId!==order.locationId||callback.orderId!==orderId||callback.amountMinor!==Math.round(order.totalAmount*100)||callback.currency!=='DKK')return new Response('Invalid callback',{status:400});
    const job=db.collection('worldlinePaymentJobs').doc(orderId);
    await db.runTransaction(async tx=>{
      const [current,prior]=await Promise.all([tx.get(ref),tx.get(job)]);
      const value=current.data();
      if(!value||value.psp?.provider!=='worldline'||JSON.stringify(value.paymentAgreement)!==JSON.stringify(order.paymentAgreement)||value.psp.transactionId&&value.psp.transactionId!==callback.transactionId)throw Error('Payment conflict');
      if(prior.exists){if(prior.data()?.transactionId!==callback.transactionId)throw Error('Payment conflict');return;}
      tx.update(ref,{'psp.transactionId':callback.transactionId});
      tx.create(job,{orderId,brandId:order.brandId,locationId:order.locationId,transactionId:callback.transactionId,state:'pending',nextAttemptAt:Date.now(),attempts:0,createdAt:Date.now(),updatedAt:Date.now()});
    });
    // A 200 means durable admission only. Provider observation and settlement run independently.
    after(async()=>{try{await reconcileWorldlineOrder(orderId);}catch{/* Durable job and worker own recovery. */}});
    return new Response('OK',{headers:{'Cache-Control':'no-store'}});
  }catch{return new Response('Callback unavailable',{status:503});}
}
