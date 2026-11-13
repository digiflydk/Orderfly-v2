import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { managedDeliveryBindingSchema } from '../provider-contract';
import { worldlineBindingSchema, assertWorldlineTransaction } from '@/lib/payments/worldline-verification';
import { readPinnedWorldlineAgreement } from '@/lib/payments/worldline-store';
import { readWorldlineTransaction } from '@/lib/payments/worldline-client';
import { readWorldlinePaymentState } from '@/lib/payments/worldline-read-retry';

type Input={orderId:string;transactionId:string;requestId:string;operation:'capture'|'credit'|'delete';amountMinor?:number;actorId:string};
type Permit={scope:{orderId:string;brandId:string;locationId:string};binding:string;revision:number;input:Input;at:number;lastObserved:number};
const permits=new WeakMap<object,Permit>();
const canceled=(order:Record<string,any>)=>order.status==='Canceled'&&(order.psp?.sessionExpired===true||order.cancellationReason==='worldline_authorization_cancel_requested');
const bindingIdentity=(value:unknown)=>JSON.stringify(worldlineBindingSchema.parse(value));
/** Only this fixed worker wrapper can mint the process-local managed capture permit. */
async function operate(orderId:string,operation:'capture'|'delete',expectedTransactionId?:string,options:{observationOnly?:boolean;retryReadFailures?:boolean}={}){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(orderId))throw Error('delivery_payment_scope');
  const observe = <T,>(read: () => Promise<T>) => readWorldlinePaymentState(read, options.retryReadFailures);
  const db=getAdminDb(),order=(await observe(()=>db.collection('orders').doc(orderId).get())).data();
  if(!order||!order.managedDelivery||order.psp?.provider!=='worldline'||(operation==='capture'?order.status!=='Pending':!canceled(order))||(operation==='capture'?order.paymentStatus!=='Pending':!['Pending','Failed'].includes(order.paymentStatus)))throw Error('delivery_capture_ineligible');
  managedDeliveryBindingSchema.parse(order.managedDelivery);
  const {binding,credentials}=await observe(()=>readPinnedWorldlineAgreement(order.paymentAgreement)),amountMinor=Math.round(order.totalAmount*100),transactionId=order.psp.transactionId;
  if(binding.owner.brandId!==order.brandId||binding.owner.locationId&&binding.owner.locationId!==order.locationId)throw Error('delivery_payment_scope');
  const observed=assertWorldlineTransaction(await observe(()=>readWorldlineTransaction(credentials,binding.mode,transactionId)),{orderId,transactionId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor,currency:'DKK'});
  if(expectedTransactionId&&expectedTransactionId!==transactionId)throw Error('delivery_payment_reference');
  if(!(operation==='capture'?['approved']:['approved','deleted']).includes(observed.status.toLowerCase())||observed.total.credited!==0||(operation==='capture'?![0,amountMinor].includes(observed.total.captured):observed.total.captured!==0))throw Error('delivery_capture_ineligible');
  const input:Input={orderId,transactionId,requestId:operation==='capture'?'initial-capture':'canceled-authorization',operation,...(operation==='capture'?{amountMinor}:{}),actorId:'worldline-worker'};
  const at=Date.now();if(!Number.isSafeInteger(at)||at<=0)throw Error('delivery_operation_clock');
  const authority=Object.freeze({});permits.set(authority,{scope:{orderId,brandId:order.brandId,locationId:order.locationId},binding:bindingIdentity(binding),revision:order.paymentRevision??0,input,at,lastObserved:at});
  const {runWorldlineOperation}=await import('@/lib/payments/worldline-operations');
  // The root journal reconciles a known operation even when the provider is already captured.
  return runWorldlineOperation(input,authority,options);
}
/** Called by the fixed financial writer inside its claim transaction, before any mutation. */
export async function assertManagedWorldlineOperation(transaction:FirebaseFirestore.Transaction,order:Record<string,any>,input:Input,authority:unknown){
  const now=Date.now();
  const permit=authority&&typeof authority==='object'?permits.get(authority):undefined;
  if(!permit||!Number.isSafeInteger(now)||now<=0||now<permit.lastObserved||now-permit.at>60000||JSON.stringify(permit.input)!==JSON.stringify(input)
    ||order.brandId!==permit.scope.brandId||order.locationId!==permit.scope.locationId||input.orderId!==permit.scope.orderId
    ||order.psp?.provider!=='worldline'||order.psp.transactionId!==input.transactionId||(input.operation==='capture'?order.status!=='Pending':!canceled(order))||(input.operation==='capture'?order.paymentStatus!=='Pending':!['Pending','Failed'].includes(order.paymentStatus))
    ||bindingIdentity(order.paymentAgreement)!==permit.binding||(order.paymentRevision??0)!==permit.revision||(input.operation==='capture'?Math.round(order.totalAmount*100)!==input.amountMinor||input.requestId!=='initial-capture':input.operation!=='delete'||input.amountMinor!==undefined||input.requestId!=='canceled-authorization')||input.actorId!=='worldline-worker')throw Error('delivery_operation_unverified');
  permit.lastObserved=now;
  managedDeliveryBindingSchema.parse(order.managedDelivery);
  const job=(await transaction.get(getAdminDb().collection('worldlinePaymentJobs').doc(input.orderId))).data();
  if(!job||job.state!=='pending'||job.orderId!==input.orderId||job.brandId!==order.brandId||job.locationId!==order.locationId||job.transactionId!==input.transactionId)throw Error('delivery_capture_job_scope');
}

export async function captureManagedWorldlineOrder(orderId:string,options:{observationOnly?:boolean;retryReadFailures?:boolean}={}){return operate(orderId,'capture',undefined,options);}
export async function cancelManagedWorldlineAuthorization(orderId:string,transactionId:string){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)||!/^[0-9]{1,32}$/.test(transactionId))throw Error('delivery_payment_scope');
  const db=getAdminDb(),ref=db.collection('orders').doc(orderId),initial=(await ref.get()).data();
  if(!initial||!initial.managedDelivery||initial.psp?.provider!=='worldline'||initial.psp.transactionId!==transactionId||!(canceled(initial)?['Pending','Failed']:['Pending']).includes(initial.paymentStatus))throw Error('delivery_cancel_ineligible');
  if(!canceled(initial)){
    if(initial.status!=='Pending'||initial.paymentOperation)throw Error('delivery_cancel_ineligible');
    const {binding,credentials}=await readPinnedWorldlineAgreement(initial.paymentAgreement),amountMinor=Math.round(initial.totalAmount*100);
    const observed=assertWorldlineTransaction(await readWorldlineTransaction(credentials,binding.mode,transactionId),{orderId,transactionId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor,currency:'DKK'});
    if(observed.status.toLowerCase()!=='approved'||observed.total.captured!==0||observed.total.credited!==0)throw Error('delivery_cancel_ineligible');
    await db.runTransaction(async tx=>{
      const order=(await tx.get(ref)).data(),job=(await tx.get(db.collection('worldlinePaymentJobs').doc(orderId))).data();
      if(!order||order.status!=='Pending'||order.paymentStatus!=='Pending'||order.paymentOperation||(order.paymentRevision??0)!==(initial.paymentRevision??0)
        ||order.psp?.transactionId!==transactionId||bindingIdentity(order.paymentAgreement)!==bindingIdentity(initial.paymentAgreement)||order.brandId!==initial.brandId||order.locationId!==initial.locationId
        ||!job||job.state!=='pending'||job.transactionId!==transactionId||job.orderId!==orderId||job.brandId!==order.brandId||job.locationId!==order.locationId)throw Error('delivery_cancel_changed');
      tx.update(ref,{status:'Canceled',cancellationReason:'worldline_authorization_cancel_requested',paymentRevision:(order.paymentRevision??0)+1});
    });
  }
  return operate(orderId,'delete',transactionId);
}

