import 'server-only';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { deliveryDispatchEnabled } from '../settings/server';
import { bookingIntentSchema } from '../booking/state';
import { originalAttemptReference } from '../booking/server';
import { deliveryCreateResultSchema, managedDeliveryBindingSchema } from '../provider-contract';
import { assertManagedRefund, managedPaymentProjection, managedStripeAccountSchema, reconcileManagedRefund, submitManagedRefund, verifyManagedPaidOrder, type VerifiedManagedPayment } from './stripe-authority';

const id=z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), digest=z.string().regex(/^[a-f0-9]{64}$/), integer=z.number().int().nonnegative().safe();
const scopeSchema=z.object({brandId:id,locationId:id,orderId:id}).strict();
type Scope=z.infer<typeof scopeSchema>;
const ledgerSchema=z.object({version:z.literal(1),scope:scopeSchema,key:digest,account:managedStripeAccountSchema,
  paymentIntentId:z.string(),checkoutSessionId:z.string(),amountMinor:integer,requestDigest:digest,
  state:z.enum(['submitting','unknown','pending','failed','succeeded']),refundId:z.string().nullable(),createdAtMs:integer,updatedAtMs:integer}).strict();
type Ledger=z.infer<typeof ledgerSchema>;
async function native(tx:FirebaseFirestore.Transaction,scope:Scope){
  const db=getAdminDb(),ref=db.collection('orders').doc(scope.orderId);
  const [orderSnap,attemptSnap,resultSnap,ledgerSnap,claimSnap,jobSnap]=await Promise.all([tx.get(ref),tx.get(ref.collection('deliveryAttempts').doc('original')),
    tx.get(ref.collection('deliveryDispatchResults').doc('original')),tx.get(ref.collection('deliveryRefunds').doc('original')),tx.get(ref.collection('deliveryDispatch').doc('original')),tx.get(db.collection('deliveryDispatchJobs').doc(scope.orderId))]);
  const order=orderSnap.data(),managed=managedDeliveryBindingSchema.safeParse(order?.managedDelivery),attempt=bookingIntentSchema.safeParse(attemptSnap.data());
  const claim=claimSnap.data(),job=jobSnap.data();
  const result=resultSnap.data(),outcome=deliveryCreateResultSchema.safeParse(result?.result),reference=originalAttemptReference(scope);
  if(!job||job.orderId!==scope.orderId||job.brandId!==scope.brandId||job.locationId!==scope.locationId||job.requestDigest!==(managed.success?managed.data.requestDigest:null)||!order||order.brandId!==scope.brandId||order.locationId!==scope.locationId||order.paymentStatus!=='Paid'||order.deliveryType!=='Delivery'
    ||!managed.success||!attempt.success||attempt.data.state!=='rejected'||attempt.data.reference!==reference||attempt.data.intentId!==reference
    ||!isDeepStrictEqual(attempt.data.scope,scope)||attempt.data.requestDigest!==managed.data.requestDigest||attempt.data.provider!==managed.data.providerId
    ||!result||result.version!==1||!isDeepStrictEqual(result.scope,scope)||result.attemptRef!==reference||result.requestDigest!==managed.data.requestDigest
    ||result.providerId!==managed.data.providerId||!integer.safeParse(result.recordedAtMs).success
    ||!(result.evidence==='definitive_local_no_dispatch'&&result.claimId===null&&!claimSnap.exists
      ||id.safeParse(result.claimId).success&&claim&&claim.claimId===result.claimId&&isDeepStrictEqual(claim.scope,scope)&&claim.requestDigest===managed.data.requestDigest&&claim.attemptRef===reference
        // The server adapter can reject after claiming but before consuming network permission.
        // Only its immutable matching rejected result authorizes this path; unknown never does.
        &&(claim.networkStartedAtMs===null||integer.safeParse(claim.networkStartedAtMs).success))
    ||!outcome.success||outcome.data.kind!=='rejected')throw new Error('delivery_refund_evidence_invalid');
  const ledger=ledgerSnap.exists?ledgerSchema.parse(ledgerSnap.data()):null;
  if(ledger&&(!isDeepStrictEqual(ledger.scope,scope)||ledger.requestDigest!==managed.data.requestDigest))throw new Error('delivery_refund_ledger_scope');
  return {ref,order,managed:managed.data,ledger};
}
function assertPayment(order:Record<string,any>,proof:VerifiedManagedPayment,scope:Scope){
  const value=managedPaymentProjection(proof);
  if(!isDeepStrictEqual(value.scope,scope)||!isDeepStrictEqual(value.binding,managedStripeAccountSchema.parse(order.managedStripeAccount))
    ||order.psp?.paymentIntentId!==value.paymentIntentId||order.psp?.checkoutSessionId!==value.checkoutSessionId
    ||Math.round(order.totalAmount*100)!==value.amountMinor)throw new Error('delivery_refund_payment_changed');
  return value;
}
/** Only the authenticated server dispatch worker may invoke this internal function. No public action/route. */
export async function processManagedDeliveryRefund(input:unknown):Promise<{state:Ledger['state'];refundId:string|null}> {
  if(!deliveryDispatchEnabled())throw new Error('delivery_refund_disabled');
  const scope=scopeSchema.parse(input),db=getAdminDb();
  const snapshot=await db.runTransaction(tx=>native(tx,scope),{readOnly:true});
  if(snapshot.ledger?.state==='succeeded')return {state:'succeeded',refundId:snapshot.ledger.refundId};
  if(snapshot.ledger?.state==='failed')return db.runTransaction(async tx=>{
    const current=await native(tx,scope);
    if(current.ledger?.state!=='failed')throw new Error('delivery_refund_state_changed');
    tx.update(db.collection('deliveryDispatchJobs').doc(scope.orderId),{refundReviewRequired:true});
    return {state:'failed' as const,refundId:current.ledger.refundId};
  });
  const proof=await verifyManagedPaidOrder(scope.orderId,snapshot.order);
  const payment=assertPayment(snapshot.order,proof,scope);
  const key=createHash('sha256').update(JSON.stringify(['delivery-refund-v1',scope,payment.binding,payment.paymentIntentId,snapshot.managed.requestDigest])).digest('hex');
  const claim=await db.runTransaction(async tx=>{
    const current=await native(tx,scope);assertPayment(current.order,proof,scope);
    if(current.ledger){
      if(current.ledger.key!==key||current.ledger.amountMinor!==payment.amountMinor||!isDeepStrictEqual(current.ledger.account,payment.binding))throw new Error('delivery_refund_conflict');
      return {ledger:current.ledger,submit:false};
    }
    if(payment.refundedAmountMinor!==0||current.order.refundedAmountOre!==undefined&&current.order.refundedAmountOre!==0
      ||current.order.refundedAmount!==undefined&&current.order.refundedAmount!==0||current.order.refundedAt!=null)throw new Error('delivery_refund_already_adjusted');
    const now=Date.now();const ledger:Ledger={version:1,scope,key,account:payment.binding,paymentIntentId:payment.paymentIntentId,
      checkoutSessionId:payment.checkoutSessionId,amountMinor:payment.amountMinor,requestDigest:current.managed.requestDigest,
      state:'submitting',refundId:null,createdAtMs:now,updatedAtMs:now};
    tx.create(current.ref.collection('deliveryRefunds').doc('original'),ledger);
    return {ledger,submit:true};
  });
  if(claim.ledger.state==='succeeded'||claim.ledger.state==='failed')return {state:claim.ledger.state,refundId:claim.ledger.refundId};
  let outcome:{id:string;status:'succeeded'|'failed'|'pending'}|null=null;
  try{
    const refund=claim.submit?await submitManagedRefund(proof,key):await reconcileManagedRefund(proof,key);
    if(refund)outcome=assertManagedRefund(proof,key,refund);
  }catch{/* Lost or invalid result remains unknown; never create again. */}
  return db.runTransaction(async tx=>{
    const current=await native(tx,scope);assertPayment(current.order,proof,scope);
    if(!current.ledger||current.ledger.key!==key)throw new Error('delivery_refund_conflict');
    if(current.ledger.state==='succeeded'||current.ledger.state==='failed')return {state:current.ledger.state,refundId:current.ledger.refundId};
    const state=outcome?.status??'unknown';
    // Never downgrade a known pending refund to unknown because a subsequent list temporarily omitted it.
    if(!outcome&&current.ledger.state==='pending')return {state:'pending' as const,refundId:current.ledger.refundId};
    if(current.ledger.refundId&&outcome&&current.ledger.refundId!==outcome.id)throw new Error('delivery_refund_result_conflict');
    const customerId=current.order.customerDetails?.id;
    const customerRef=typeof customerId==='string'&&id.safeParse(customerId).success?db.collection('customers').doc(customerId):null;
    const customer=state==='succeeded'&&customerRef?await tx.get(customerRef):null;
    const adjustmentRef=current.ref.collection('financialAdjustments').doc(key),adjustment=state==='succeeded'?await tx.get(adjustmentRef):null;
    if(adjustment?.exists)throw new Error('delivery_refund_adjustment_conflict');
    if(state==='succeeded'){
      if(current.order.refundedAmountOre!==undefined&&current.order.refundedAmountOre!==0||current.order.refundedAmount!==undefined&&current.order.refundedAmount!==0||current.order.refundedAt!=null)throw new Error('delivery_refund_accounting_conflict');
      const spend=customer?.data()?.totalSpend,spendMinor=typeof spend==='number'&&Number.isFinite(spend)?Math.round(spend*100):NaN;
      const customerApplied=!!customer?.exists&&customer.data()?.brandId===scope.brandId&&Number.isSafeInteger(spendMinor)&&spendMinor>=payment.amountMinor;
      const stamp=getAdminFieldValue().serverTimestamp();
      tx.update(db.collection('deliveryDispatchJobs').doc(scope.orderId),{refundCompletedAtMs:Date.now()});
      tx.update(current.ref,{refundedAmountOre:payment.amountMinor,refundedAt:stamp,status:'Canceled',deliveryStatus:'failed',updatedAt:stamp});
      if(customerApplied&&customerRef)tx.update(customerRef,{totalSpend:(spendMinor-payment.amountMinor)/100});
      tx.create(adjustmentRef,{version:1,scope,type:'delivery_full_refund',refundId:outcome!.id,amountMinor:-payment.amountMinor,currency:'DKK',
        originalInvoiceNumber:current.order.invoice?.number??null,paymentIntentId:payment.paymentIntentId,account:payment.binding,customerId:customerId??null,
        customerApplied,requiresCustomerReconciliation:!customerApplied,createdAt:stamp});
    }
    if(state==='failed')tx.update(db.collection('deliveryDispatchJobs').doc(scope.orderId),{refundReviewRequired:true});
    tx.set(current.ref.collection('deliveryRefunds').doc('original'),{...current.ledger,state,refundId:outcome?.id??current.ledger.refundId,updatedAtMs:Date.now()});
    return {state,refundId:outcome?.id??current.ledger.refundId};
  });
}
