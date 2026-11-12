import 'server-only';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import * as stripe from './stripe-authority';
import { managedDeliveryBindingSchema } from '../provider-contract';
import { readPinnedWorldlineAgreement } from '@/lib/payments/worldline-store';
import { readWorldlineTransaction, mutateWorldlineTransaction } from '@/lib/payments/worldline-client';
import { worldlineBindingSchema, assertWorldlineTransaction, type WorldlineBinding } from '@/lib/payments/worldline-verification';

export const managedPaymentAccountSchema=z.union([stripe.managedStripeAccountSchema,worldlineBindingSchema]);
export type ManagedPaymentAccount=z.infer<typeof managedPaymentAccountSchema>;
type Scope={brandId:string;locationId:string;orderId:string};
type Projection={provider:'stripe'|'worldline';binding:ManagedPaymentAccount;paymentReference:string;checkoutReference:string;amountMinor:number;refundedAmountMinor:number;scope:Scope;revision?:number};
export type VerifiedManagedPayment=Readonly<{readonly verifiedManagedPayment:unique symbol}>;
type Entry={managedBinding:string;value:Projection;at:number;lastObserved:number;native?:stripe.VerifiedManagedPayment;worldline?:{credentials:Awaited<ReturnType<typeof readPinnedWorldlineAgreement>>['credentials'];binding:WorldlineBinding}};
const proofs=new WeakMap<object,Entry>();
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function managedPaymentAccount(order:Record<string,any>):ManagedPaymentAccount{
  if(order.psp?.provider==='worldline'){
    const binding=worldlineBindingSchema.parse(order.paymentAgreement);
    if(binding.owner.brandId!==order.brandId||binding.owner.locationId&&binding.owner.locationId!==order.locationId)throw Error('delivery_payment_scope');
    return binding;
  }
  if(order.psp?.provider&&order.psp.provider!=='stripe')throw Error('delivery_payment_provider');
  return stripe.managedStripeAccountSchema.parse(order.managedStripeAccount);
}
export function managedPaymentEnvironment(order:Record<string,any>):'sandbox'|'production'{
  const account=managedPaymentAccount(order);
  return 'provider' in account?account.mode==='live'?'production':'sandbox':account.livemode?'production':'sandbox';
}
export function managedPaymentReference(order:Record<string,any>):string{
  const value=order.psp?.provider==='worldline'?order.psp.transactionId:order.psp?.paymentIntentId;
  if(typeof value!=='string'||!(order.psp?.provider==='worldline'?/^[0-9]{1,32}$/:/^pi_[A-Za-z0-9]+$/).test(value))throw Error('delivery_payment_reference');
  return value;
}
/** Independent provider retrieval. No browser or webhook DTO can mint this opaque authority. */
export async function verifyManagedPaidOrder(orderId:string,order:Record<string,any>,options:{allowRefundInFlight?:boolean}={}):Promise<VerifiedManagedPayment>{
  const managedBinding=JSON.stringify(managedDeliveryBindingSchema.parse(order.managedDelivery));
  if(order.psp?.provider!=='worldline'){
    const native=await stripe.verifyManagedPaidOrder(orderId,order),value=stripe.managedPaymentProjection(native);
    const at=Date.now();if(!Number.isSafeInteger(at)||at<=0)throw Error('delivery_payment_proof_clock');
    const proof=Object.freeze({}) as VerifiedManagedPayment;
    proofs.set(proof,{managedBinding,native,at,lastObserved:at,value:{provider:'stripe',binding:value.binding,paymentReference:value.paymentIntentId,checkoutReference:value.checkoutSessionId,amountMinor:value.amountMinor,refundedAmountMinor:value.refundedAmountMinor,scope:value.scope}});return proof;
  }
  const scope={brandId:order.brandId,locationId:order.locationId,orderId};
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)||!order.managedDelivery||order.deliveryType!=='Delivery'||order.paymentMethod!=='Worldline'
    ||!['Pending','Paid'].includes(order.paymentStatus)||typeof order.psp.checkoutSessionId!=='string'||!order.psp.checkoutSessionId
    ||order.paymentOperation&&!(options.allowRefundInFlight&&/^delivery-refund:[a-f0-9]{64}$/.test(order.paymentOperation)))throw Error('delivery_payment_invalid');
  const account=managedPaymentAccount(order),{binding,credentials}=await readPinnedWorldlineAgreement(account);
  const transactionId=managedPaymentReference(order),amountMinor=Math.round(order.totalAmount*100);
  const observed=assertWorldlineTransaction(await readWorldlineTransaction(credentials,binding.mode,transactionId),{transactionId,orderId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor,currency:'DKK'});
  if(observed.status.toLowerCase()!=='approved'||observed.total.captured!==amountMinor)throw Error('delivery_payment_not_captured');
  const at=Date.now();if(!Number.isSafeInteger(at)||at<=0)throw Error('delivery_payment_proof_clock');
  const proof=Object.freeze({}) as VerifiedManagedPayment;
  proofs.set(proof,{managedBinding,at,lastObserved:at,worldline:{binding,credentials},value:{provider:'worldline',binding:worldlineBindingSchema.parse(binding),paymentReference:transactionId,checkoutReference:order.psp.checkoutSessionId,amountMinor,refundedAmountMinor:observed.total.credited,scope,revision:order.paymentRevision??0}});return proof;
}
export function managedPaymentProjection(proof:VerifiedManagedPayment):Projection{
  const entry=proof&&proofs.get(proof),now=Date.now();
  if(!entry||!Number.isSafeInteger(now)||now<=0||now<entry.lastObserved||now-entry.at>60000){if(proof)proofs.delete(proof);throw Error('delivery_payment_proof_expired');}
  entry.lastObserved=now;
  if(entry.native)stripe.managedPaymentProjection(entry.native);
  return structuredClone(entry.value);
}
export function assertManagedPaymentOrder(order:Record<string,any>,proof:VerifiedManagedPayment,scope:Scope,refundKey?:string){
  const value=managedPaymentProjection(proof);
  if(JSON.stringify(managedDeliveryBindingSchema.parse(order.managedDelivery))!==proofs.get(proof)!.managedBinding||!isDeepStrictEqual(value.scope,scope)||!isDeepStrictEqual(value.binding,managedPaymentAccount(order))
    ||order.psp?.provider!==value.provider||order.psp?.checkoutSessionId!==value.checkoutReference||Math.round(order.totalAmount*100)!==value.amountMinor
    ||value.provider==='stripe'&&(order.paymentStatus==='Paid'||order.psp.paymentIntentId!==undefined)&&order.psp.paymentIntentId!==value.paymentReference
    ||value.provider==='worldline'&&(managedPaymentReference(order)!==value.paymentReference||(order.paymentRevision??0)!==value.revision
      ||order.paymentOperation&&order.paymentOperation!==`delivery-refund:${refundKey}`))throw Error('delivery_payment_changed');
  return value;
}
type WorldlineRefund={provider:'worldline';id:string;key:string;transactionId:string;amountMinor:number;confirmed:boolean;rejected:boolean;binding:WorldlineBinding;scope:Scope};
export type ManagedRefund=Parameters<typeof stripe.assertManagedRefund>[2]|WorldlineRefund;
function entry(proof:VerifiedManagedPayment){managedPaymentProjection(proof);return proofs.get(proof)!;}
async function worldlineRefundObservation(proof:VerifiedManagedPayment,key:string,rejected=false):Promise<WorldlineRefund>{
  const saved=entry(proof),value=saved.value,{binding,credentials}=saved.worldline!;
  const observed=assertWorldlineTransaction(await readWorldlineTransaction(credentials,binding.mode,value.paymentReference),{transactionId:value.paymentReference,orderId:value.scope.orderId,merchantNumber:binding.merchantNumber,mode:binding.mode,amountMinor:value.amountMinor,currency:'DKK'});
  return {provider:'worldline',id:`worldline-credit-${key}`,key,transactionId:value.paymentReference,amountMinor:value.amountMinor,confirmed:observed.total.credited===value.amountMinor,rejected,binding,scope:value.scope};
}
export async function submitManagedRefund(proof:VerifiedManagedPayment,key:string):Promise<ManagedRefund>{
  const saved=entry(proof),value=saved.value;
  if(!/^[a-f0-9]{64}$/.test(key)||value.refundedAmountMinor!==0)throw Error('delivery_refund_ineligible');
  if(saved.native)return stripe.submitManagedRefund(saved.native,key);
  let rejected=false;
  try{await mutateWorldlineTransaction(saved.worldline!.credentials,saved.worldline!.binding.mode,value.paymentReference,'credit',value.amountMinor);}catch(error){rejected=(error as {outcome?:string}).outcome==='rejected';}
  return worldlineRefundObservation(proof,key,rejected);
}
export async function reconcileManagedRefund(proof:VerifiedManagedPayment,key:string):Promise<ManagedRefund|null>{
  const saved=entry(proof);if(saved.native)return stripe.reconcileManagedRefund(saved.native,key);
  return worldlineRefundObservation(proof,key);
}
export function assertManagedRefund(proof:VerifiedManagedPayment,key:string,refund:ManagedRefund){
  const saved=entry(proof);if(saved.native)return stripe.assertManagedRefund(saved.native,key,refund as Parameters<typeof stripe.assertManagedRefund>[2]);
  const value=saved.value,observed=refund as WorldlineRefund;
  if(observed.provider!=='worldline'||observed.key!==key||observed.id!==`worldline-credit-${key}`||observed.transactionId!==value.paymentReference||observed.amountMinor!==value.amountMinor||!isDeepStrictEqual(observed.binding,value.binding)||!isDeepStrictEqual(observed.scope,value.scope))throw Error('delivery_refund_mismatch');
  return {id:observed.id,status:observed.confirmed?'succeeded' as const:observed.rejected?'failed' as const:'pending' as const};
}
export function managedRefundKey(scope:Scope,account:ManagedPaymentAccount,paymentReference:string,requestDigest:string){
 return hash(['delivery-refund-v1',scope,account,paymentReference,requestDigest]);
}
