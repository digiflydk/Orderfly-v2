import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { readPinnedWorldlineAgreement } from './worldline-store';
import { readWorldlineTransaction } from './worldline-client';
import { assertWorldlineTransaction, worldlineBindingSchema } from './worldline-verification';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { KitchenOrder } from '@/lib/printing/domain';

export type WorldlinePaymentProof = Readonly<{readonly worldlinePaymentProof:unique symbol}>;
export type WorldlinePrintTransition = Readonly<{readonly worldlinePrintTransition:unique symbol}>;
type Verified = {orderId:string;brandId:string;locationId:string;transactionId:string;amountMinor:number;binding:string;revision:number;at:number;lastObserved:number};
const proofs=new WeakMap<object,Verified>();
const transitions=new WeakMap<object,{context:NativeTransactionContext;proof:WorldlinePaymentProof;value:Readonly<{order:Readonly<KitchenOrder>;replay:boolean}>}>();
export async function verifyWorldlinePaidOrder(orderId:string,transactionId:string):Promise<WorldlinePaymentProof>{
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(orderId))throw Error('Invalid payment order');
  const order=(await getAdminDb().collection('orders').doc(orderId).get()).data();
  if(!order||order.paymentOperation||order.psp?.provider!=='worldline'||order.psp.transactionId!==transactionId||order.paymentMethod!=='Worldline')throw Error('Worldline payment scope mismatch');
  const {binding:rawBinding,credentials}=await readPinnedWorldlineAgreement(order.paymentAgreement);
  const binding=worldlineBindingSchema.parse(rawBinding);
  if(binding.owner.brandId!==order.brandId||binding.owner.locationId&&binding.owner.locationId!==order.locationId)throw Error('Worldline payment scope mismatch');
  const amountMinor=Math.round(order.totalAmount*100);
  assertWorldlineTransaction(await readWorldlineTransaction(credentials,binding.mode,transactionId),{transactionId,orderId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor,currency:'DKK'},true);
  const at=Date.now();if(!Number.isSafeInteger(at)||at<=0)throw Error('Invalid payment proof clock');
  const handle=Object.freeze({}) as WorldlinePaymentProof;
  proofs.set(handle,{orderId,brandId:order.brandId,locationId:order.locationId,transactionId,amountMinor,binding:JSON.stringify(binding),revision:order.paymentRevision??0,at,lastObserved:at});
  return handle;
}
export function worldlinePaymentProjection(proof:WorldlinePaymentProof){
  const value=proof&&proofs.get(proof);
  const now=Date.now();
  if(!value||!Number.isSafeInteger(now)||now<=0||now<value.lastObserved||now-value.at>=300000){if(proof)proofs.delete(proof);throw Error('Unverified Worldline payment');}
  value.lastObserved=now;return Object.freeze({...value});
}
/** Revalidate against the exact transaction snapshot, including frozen account and refunds. */
export function assertWorldlineOrder(proof:WorldlinePaymentProof,orderId:string,order:Record<string,any>){
  const value=worldlinePaymentProjection(proof);
  if(order.paymentOperation||(order.paymentRevision??0)!==value.revision||value.orderId!==orderId||value.brandId!==order.brandId||value.locationId!==order.locationId||order.psp?.provider!=='worldline'
    ||order.psp.transactionId!==value.transactionId||order.paymentMethod!=='Worldline'
    ||JSON.stringify(worldlineBindingSchema.parse(order.paymentAgreement))!==value.binding||Math.round(order.totalAmount*100)!==value.amountMinor
    ||(order.refundedAmountOre??0)!==0||(order.refundedAmount??0)!==0||order.refundedAt)throw Error('Worldline payment changed');
  return value;
}
export async function prepareWorldlinePrintTransition(context:NativeTransactionContext,proof:WorldlinePaymentProof){
  if(context.db!==getAdminDb())throw Error('Invalid transaction context');
  const value=worldlinePaymentProjection(proof),{db,transaction}=context;
  const [order,brand,location]=await Promise.all([transaction.get(db.collection('orders').doc(value.orderId)),transaction.get(db.collection('brands').doc(value.brandId)),transaction.get(db.collection('locations').doc(value.locationId))]);
  const current=order.data();
  if(current?.managedDelivery)throw Error('Managed Worldline printing requires courier acceptance');
  if(!current||!brand.exists||!location.exists||location.data()?.brandId!==value.brandId)throw Error('Invalid Worldline print scope');
  assertWorldlineOrder(proof,value.orderId,current);
  if(!['Pending','Received','In Progress','Ready'].includes(current.status)||!['Pending','Paid'].includes(current.paymentStatus)||(current.paymentStatus==='Paid'&&current.status==='Pending'))throw Error('Invalid Worldline print state');
  const handle=Object.freeze({}) as WorldlinePrintTransition;
  transitions.set(handle,{context,proof,value:Object.freeze({order:Object.freeze({id:value.orderId,brandId:value.brandId,locationId:value.locationId,status:current.status==='Pending'?'Received':current.status,paymentStatus:'Paid',paymentMethod:'Worldline',deliveryType:current.deliveryType}),replay:current.paymentStatus==='Paid'})});
  return handle;
}
export function worldlinePrintTransitionProjection(context:NativeTransactionContext,handle:WorldlinePrintTransition){
  const value=handle&&transitions.get(handle);
  if(!value||value.context!==context)throw Error('Invalid Worldline print transition');
  worldlinePaymentProjection(value.proof);return value.value;
}
