import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { discountCardAmountOre } from '@/lib/loyalty/discount-card/rules';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { KitchenOrder } from '@/lib/printing/domain';

const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const amount=z.number().int().positive().safe();
const freeOrderSchema=z.object({
  brandId:id,locationId:id,totalAmount:z.literal(0),paymentMethod:z.literal('Free'),
  paymentStatus:z.enum(['Pending','Paid']),productItems:z.array(z.unknown()).nonempty().max(200),
  freeCheckout:z.object({version:z.literal(1),kind:z.literal('discount_card')}).strict(),
  psp:z.undefined(),paymentAgreement:z.undefined(),
  paymentOperation:z.union([z.null(),z.undefined()]),
  customerDetails:z.object({id}),
  discountCard:z.object({brandId:id,locationId:id,customerId:id,memberId:id,assignmentId:id,groupId:id,
    groupName:z.string().min(1),percentage:z.number().positive().max(100).multipleOf(0.01),featureVersion:z.number().int().positive(),
    groupVersion:z.number().int().positive(),assignmentVersion:z.number().int().positive(),
    eligibleSubtotalOre:amount,amountOre:amount,purchaseStampsEligible:z.literal(false)}),
  paymentDetails:z.object({subtotal:z.number().finite().positive(),itemDiscountTotal:z.literal(0),
    cartDiscountTotal:z.number().finite().positive(),discountTotal:z.number().finite().positive(),
    deliveryFee:z.literal(0),bagFee:z.literal(0),adminFee:z.literal(0)}),
});
/** Pure predicate over the persisted authoritative checkout snapshot. No PSP identity is invented. */
export function isNativeFreeCheckoutOrder(input:unknown):boolean{
  const parsed=freeOrderSchema.safeParse(input);if(!parsed.success)return false;
  const order=parsed.data,card=order.discountCard,payment=order.paymentDetails;
  return card.brandId===order.brandId&&card.locationId===order.locationId&&card.customerId===order.customerDetails.id
    &&card.amountOre===card.eligibleSubtotalOre&&discountCardAmountOre(card.eligibleSubtotalOre,card.percentage)===card.amountOre
    &&Math.round(payment.subtotal*100)===card.amountOre&&Math.round(payment.cartDiscountTotal*100)===card.amountOre
    &&Math.round(payment.discountTotal*100)===card.amountOre;
}
export type NativeFreeCheckoutProof=Readonly<{readonly nativeFreeCheckoutProof:unique symbol}>;
export type NativeFreePrintTransition=Readonly<{readonly nativeFreePrintTransition:unique symbol}>;
type Verified={orderId:string;brandId:string;locationId:string;fingerprint:string;revision:number;at:number;lastObservedAt:number};
const proofs=new WeakMap<object,Verified>();
const transitions=new WeakMap<object,{context:NativeTransactionContext;proof:NativeFreeCheckoutProof;value:Readonly<{order:Readonly<KitchenOrder>;replay:boolean}>}>();
function fingerprint(order:Record<string,any>){
  return createHash('sha256').update(JSON.stringify({brandId:order.brandId,locationId:order.locationId,customerId:order.customerDetails?.id,
    totalAmount:order.totalAmount,freeCheckout:order.freeCheckout,discountCard:order.discountCard,paymentDetails:order.paymentDetails,productItems:order.productItems})).digest('hex');
}
export async function verifyFreeCheckout(orderId:string):Promise<NativeFreeCheckoutProof>{
  id.parse(orderId);
  const order=(await getAdminDb().collection('orders').doc(orderId).get()).data();
  if(!order||!isNativeFreeCheckoutOrder(order)||(order.refundedAmountOre??0)!==0||(order.refundedAmount??0)!==0||order.refundedAt)throw Error('Unverified free checkout');
  const at=Date.now();if(!Number.isSafeInteger(at)||at<=0)throw Error('Invalid proof clock');
  const handle=Object.freeze({}) as NativeFreeCheckoutProof;
  proofs.set(handle,{orderId,brandId:order.brandId,locationId:order.locationId,fingerprint:fingerprint(order),revision:order.paymentRevision??0,at,lastObservedAt:at});
  return handle;
}
export function freeCheckoutProjection(proof:NativeFreeCheckoutProof){
  const value=proof&&proofs.get(proof),now=Date.now();
  if(!value||!Number.isSafeInteger(now)||now<value.lastObservedAt||now-value.at>=300000){if(proof)proofs.delete(proof);throw Error('Unverified free checkout proof');}
  value.lastObservedAt=now;return Object.freeze({orderId:value.orderId,brandId:value.brandId,locationId:value.locationId,amountMinor:0});
}
export function assertFreeCheckoutOrder(proof:NativeFreeCheckoutProof,orderId:string,order:Record<string,any>){
  const scope=freeCheckoutProjection(proof),value=proofs.get(proof)!;
  if(!isNativeFreeCheckoutOrder(order)||orderId!==scope.orderId||order.brandId!==scope.brandId||order.locationId!==scope.locationId
    ||fingerprint(order)!==value.fingerprint||(order.paymentRevision??0)!==value.revision
    ||(order.refundedAmountOre??0)!==0||(order.refundedAmount??0)!==0||order.refundedAt)throw Error('Free checkout changed');
  return scope;
}
export async function prepareFreePrintTransition(context:NativeTransactionContext,proof:NativeFreeCheckoutProof):Promise<NativeFreePrintTransition>{
  if(context.db!==getAdminDb()||!context.transaction)throw Error('Invalid transaction context');
  const scope=freeCheckoutProjection(proof),{db,transaction}=context;
  const [order,brand,location]=await Promise.all([transaction.get(db.collection('orders').doc(scope.orderId)),transaction.get(db.collection('brands').doc(scope.brandId)),transaction.get(db.collection('locations').doc(scope.locationId))]);
  const current=order.data();
  if(!current||!brand.exists||!location.exists||location.data()?.brandId!==scope.brandId)throw Error('Invalid free print scope');
  assertFreeCheckoutOrder(proof,scope.orderId,current);
  if(!['Pending','Received','In Progress','Ready'].includes(current.status)||!['Pending','Paid'].includes(current.paymentStatus)||(current.paymentStatus==='Paid'&&current.status==='Pending'))throw Error('Invalid free print state');
  const handle=Object.freeze({}) as NativeFreePrintTransition;
  transitions.set(handle,{context,proof,value:Object.freeze({order:Object.freeze({id:scope.orderId,brandId:scope.brandId,locationId:scope.locationId,status:current.status==='Pending'?'Received':current.status,paymentStatus:'Paid',paymentMethod:'Free',deliveryType:current.deliveryType}),replay:current.paymentStatus==='Paid'})});
  return handle;
}
export function freePrintTransitionProjection(context:NativeTransactionContext,handle:NativeFreePrintTransition){
  const value=handle&&transitions.get(handle);if(!value||value.context!==context)throw Error('Invalid free print transition');
  freeCheckoutProjection(value.proof);return value.value;
}
