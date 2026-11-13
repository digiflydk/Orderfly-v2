import 'server-only';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { getAdminDb } from '@/lib/firebase-admin';
import { readPinnedWorldlineAgreement } from './worldline-store';
import { readWorldlineTransaction, mutateWorldlineTransaction } from './worldline-client';
import { assertWorldlineTransaction } from './worldline-verification';
import { readWorldlinePaymentState } from './worldline-read-retry';

/** Durable single-flight money operation. Unknown results are read back, never sent again automatically. */
export async function runWorldlineOperation(input:{orderId:string;transactionId:string;requestId:string;operation:'capture'|'credit'|'delete';amountMinor?:number;actorId:string},managedAuthority?:unknown,options:{observationOnly?:boolean;retryReadFailures?:boolean}={}){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(input.orderId)||!/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId)||!input.actorId)throw Error('Invalid operation');
  if(options.observationOnly&&input.operation!=='capture')throw Error('Observation recovery only supports capture');
  const db=getAdminDb(),ref=db.collection('orders').doc(input.orderId);
  const journal=ref.collection('paymentOperations').doc(createHash('sha256').update(input.requestId).digest('hex'));
  const observe = <T,>(read: () => Promise<T>) => readWorldlinePaymentState(read, options.retryReadFailures);
  const order=(await observe(()=>ref.get())).data();
  if(!order||order.paymentMethod!=='Worldline'||order.psp?.provider!=='worldline'||order.psp.transactionId!==input.transactionId||(order.managedDelivery&&!managedAuthority))throw Error('Payment scope mismatch');
  const {binding,credentials}=await observe(()=>readPinnedWorldlineAgreement(order.paymentAgreement));
  if(binding.owner.brandId!==order.brandId||binding.owner.locationId&&binding.owner.locationId!==order.locationId)throw Error('Payment scope mismatch');
  const expected={orderId:input.orderId,transactionId:input.transactionId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor:Math.round(order.totalAmount*100),currency:'DKK'};
  const read=async()=>assertWorldlineTransaction(await observe(()=>readWorldlineTransaction(credentials,binding.mode,input.transactionId)),expected);
  const before=await read();
  const fingerprint=createHash('sha256').update(JSON.stringify([input.orderId,input.transactionId,input.operation,input.amountMinor??null,input.actorId])).digest('hex');
  const claim=await db.runTransaction(async tx=>{
    const [current,previous]=await Promise.all([tx.get(ref),tx.get(journal)]);
    const value=current.data();
    if(!value||value.brandId!==order.brandId||value.locationId!==order.locationId||value.totalAmount!==order.totalAmount
      ||value.paymentMethod!==order.paymentMethod||value.psp?.provider!=='worldline'||value.psp.transactionId!==input.transactionId
      ||JSON.stringify(value.paymentAgreement)!==JSON.stringify(order.paymentAgreement))throw Error('Payment binding changed');
    if(value.managedDelivery)await (await import('@/lib/delivery/payments/worldline-operation-authority')).assertManagedWorldlineOperation(tx,value,input,managedAuthority);
    if(previous.exists){
      if(previous.data()?.fingerprint!==fingerprint||options.observationOnly&&!isDeepStrictEqual(previous.data()?.binding,order.paymentAgreement))throw Error('Operation conflict');
      return {send:false,record:previous.data()!};
    }
    // Recovery may finish an existing operation and its financial settlement,
    // but can never create a journal or send a new capture, even after deletion.
    if(options.observationOnly)throw Error('Capture observation requires an existing journal');
    if((value.paymentRevision??0)!==(order.paymentRevision??0))throw Error('Payment state changed; reload');
    if(value.paymentOperation)throw Error('Another payment operation requires reconciliation');
    const amount=input.amountMinor;
    if(input.operation==='capture'&&(value.status==='Canceled'||!['Pending','Paid'].includes(value.paymentStatus??'Pending')))throw Error('Order cannot be captured');
    if(input.operation==='capture'&&(!Number.isSafeInteger(amount)||amount!==expected.amountMinor||before.total.captured!==0||before.total.credited!==0||before.status.toLowerCase()!=='approved'))throw Error('Invalid capture state');
    if(input.operation==='credit'&&(value.paymentStatus!=='Paid'||!Number.isSafeInteger(amount)||amount!<=0||amount!>before.total.captured-before.total.credited||before.status.toLowerCase()!=='approved'))throw Error('Invalid refund state');
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
      // Refund accounting commits with the money journal, once. Missing/deleted
      // customers are explicit reconciliation work, never invented negative spend.
      const refund = confirmed && input.operation==='credit';
      const adjustmentRef = ref.collection('financialAdjustments').doc(journal.id);
      const customerId=current.data()?.customerDetails?.id;
      const customerRef=typeof customerId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(customerId)?db.collection('customers').doc(customerId):null;
      const [adjustment,customer]=refund?await Promise.all([tx.get(adjustmentRef),customerRef?tx.get(customerRef):null]):[null,null];
      if(refund && (adjustment?.exists || (current.data()?.refundedAmountOre??0)!==claim.record.baselineCredited))throw Error('Refund accounting conflict');
      if(refund){
        const spend=customer?.data()?.totalSpend;
        const spendMinor=typeof spend==='number'&&Number.isFinite(spend)?Math.round(spend*100):NaN;
        const customerApplied=!!customer?.exists&&customer.data()?.brandId===current.data()?.brandId&&Number.isSafeInteger(spendMinor)&&spendMinor>=input.amountMinor!;
        if(customerApplied&&customerRef)tx.update(customerRef,{totalSpend:(spendMinor-input.amountMinor!)/100});
        tx.create(adjustmentRef,{version:1,type:'worldline_refund',brandId:current.data()!.brandId,locationId:current.data()!.locationId,orderId:input.orderId,transactionId:input.transactionId,
          requestId:input.requestId,actorId:input.actorId,amountMinor:-input.amountMinor!,currency:'DKK',originalInvoiceNumber:current.data()?.invoice?.number??null,
          customerId:customerId??null,customerApplied,requiresCustomerReconciliation:!customerApplied,createdAt:new Date()});
      }
      tx.update(journal,{state,updatedAt:Date.now()});
      if(confirmed||rejected)tx.update(ref,{paymentOperation:null,paymentRevision:(current.data()?.paymentRevision??0)+1,...(confirmed&&input.operation==='credit'?{refundedAmountOre:after.total.credited,refundedAt:new Date()}:{}),...(confirmed&&input.operation==='delete'?{'psp.voided':true}:{})});
      return state as 'confirmed'|'rejected'|'unknown';
    });
  }catch{/* Leave durable sending/unknown intact. A failed final commit must not report confirmation. */}
  return {state:persisted};
}
