import 'server-only';
import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { readPinnedWorldlineAgreement } from './worldline-store';
import { readWorldlineTransaction, mutateWorldlineTransaction } from './worldline-client';
import { assertWorldlineTransaction } from './worldline-verification';

/** Durable single-flight money operation. Unknown results are read back, never sent again automatically. */
export async function runWorldlineOperation(input:{orderId:string;transactionId:string;requestId:string;operation:'capture'|'credit'|'delete';amountMinor?:number;actorId:string}){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(input.orderId)||!/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId)||!input.actorId)throw Error('Invalid operation');
  const db=getAdminDb(),ref=db.collection('orders').doc(input.orderId);
  const journal=ref.collection('paymentOperations').doc(createHash('sha256').update(input.requestId).digest('hex'));
  const order=(await ref.get()).data();
  if(!order||order.psp?.provider!=='worldline'||order.psp.transactionId!==input.transactionId||order.managedDelivery)throw Error('Payment scope mismatch');
  const {binding,credentials}=await readPinnedWorldlineAgreement(order.paymentAgreement);
  if(binding.owner.brandId!==order.brandId||binding.owner.locationId&&binding.owner.locationId!==order.locationId)throw Error('Payment scope mismatch');
  const expected={orderId:input.orderId,transactionId:input.transactionId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor:Math.round(order.totalAmount*100),currency:'DKK'};
  const read=async()=>assertWorldlineTransaction(await readWorldlineTransaction(credentials,binding.mode,input.transactionId),expected);
  const before=await read();
  const fingerprint=createHash('sha256').update(JSON.stringify([input.orderId,input.transactionId,input.operation,input.amountMinor??null,input.actorId])).digest('hex');
  const claim=await db.runTransaction(async tx=>{
    const [current,previous]=await Promise.all([tx.get(ref),tx.get(journal)]);
    const value=current.data();
    if(!value||value.psp?.transactionId!==input.transactionId||JSON.stringify(value.paymentAgreement)!==JSON.stringify(order.paymentAgreement))throw Error('Payment binding changed');
    if(previous.exists){if(previous.data()?.fingerprint!==fingerprint)throw Error('Operation conflict');return {send:false,record:previous.data()!};}
    if((value.paymentRevision??0)!==(order.paymentRevision??0))throw Error('Payment state changed; reload');
    if(value.paymentOperation)throw Error('Another payment operation requires reconciliation');
    const amount=input.amountMinor;
    if(input.operation==='capture'&&(value.status==='Canceled'||!['Pending','Paid'].includes(value.paymentStatus??'Pending')))throw Error('Order cannot be captured');
    if(input.operation==='capture'&&(!Number.isSafeInteger(amount)||amount!==expected.amountMinor||before.total.captured!==0||before.total.credited!==0||before.status.toLowerCase()!=='approved'))throw Error('Invalid capture state');
    if(input.operation==='credit'&&(!Number.isSafeInteger(amount)||amount!<=0||amount!>before.total.captured-before.total.credited||before.status.toLowerCase()!=='approved'))throw Error('Invalid refund state');
    if(input.operation==='delete'&&(amount!==undefined||before.total.captured!==0||before.status.toLowerCase()!=='approved'))throw Error('Invalid cancellation state');
    const record={...input,amountMinor:amount??null,fingerprint,state:'sending',binding:order.paymentAgreement,baselineCaptured:before.total.captured,baselineCredited:before.total.credited,createdAt:Date.now(),updatedAt:Date.now()};
    tx.create(journal,record);tx.update(ref,{paymentOperation:journal.id});return {send:true,record};
  });
  if(claim.record.state==='confirmed')return {state:'confirmed' as const};
  let rejected=false;
  if(claim.send){try{await mutateWorldlineTransaction(credentials,binding.mode,input.transactionId,input.operation,input.amountMinor);}catch(error){rejected=(error as {outcome?:string}).outcome==='rejected';}}
  let persisted:'confirmed'|'rejected'|'unknown'='unknown';
  let confirmed=false;
  try{
    const after=await read();
    confirmed=input.operation==='capture'?after.total.captured===claim.record.baselineCaptured+input.amountMinor!:input.operation==='credit'?after.total.credited===claim.record.baselineCredited+input.amountMinor!:after.status.toLowerCase()==='deleted';
    persisted=await db.runTransaction(async tx=>{
      const [current,entry]=await Promise.all([tx.get(ref),tx.get(journal)]);
      if(entry.data()?.fingerprint!==fingerprint)throw Error('Operation changed');
      if(entry.data()?.state==='confirmed'||entry.data()?.state==='rejected')return entry.data()!.state as 'confirmed'|'rejected';
      if(current.data()?.paymentOperation!==journal.id)throw Error('Operation changed');
      const state=confirmed?'confirmed':rejected?'rejected':'unknown';
      tx.update(journal,{state,updatedAt:Date.now()});
      if(confirmed||rejected)tx.update(ref,{paymentOperation:null,paymentRevision:(current.data()?.paymentRevision??0)+1,...(confirmed&&input.operation==='credit'?{refundedAmountOre:after.total.credited}:{}),...(confirmed&&input.operation==='delete'?{'psp.voided':true}:{})});
      return state as 'confirmed'|'rejected'|'unknown';
    });
  }catch{/* Leave durable sending/unknown intact. A failed final commit must not report confirmation. */}
  return {state:persisted};
}
