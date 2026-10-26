import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { KitchenOrder } from '@/lib/printing/domain';
import { preparePrintIntentTargetPolicy } from '@/lib/printing/intent-target-policy';
import { projectNativePrintCatalog } from '@/lib/printing/catalog-line-projection';
import { prepareSavedPrinterRouting } from '@/lib/printing/saved-routing';
import { previewPrinterRouting } from '@/lib/printing/routing-preview';
import { prepareManagedDeliveryAcceptancePrintIntents } from '@/lib/printing/outbox';
import { paidOrderMarketingEnabled } from '@/lib/marketing/config';
import { bookingIntentSchema } from '../booking/state';
import { originalAttemptReference } from '../booking/server';
import { deliveryCreateResultSchema, managedDeliveryBindingSchema } from '../provider-contract';
import { managedPaymentProjection, verifyManagedPaidOrder, type VerifiedManagedPayment } from './stripe-authority';

const id=z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const scopeSchema=z.object({brandId:id,locationId:id,orderId:id}).strict();
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type ManagedDeliveryAcceptanceCapability=Readonly<{readonly managedDeliveryAcceptanceCapability:unique symbol}>;
const capabilities=new WeakMap<object,{context:NativeTransactionContext;order:Readonly<KitchenOrder>;applied:boolean;writeCount:number;proof:VerifiedManagedPayment}>();
export function readManagedDeliveryAcceptanceCapability(context:NativeTransactionContext,capability:ManagedDeliveryAcceptanceCapability,requireApplied=false){
  const entry=capabilities.get(capability);
  if(!entry||entry.context!==context||context.db!==getAdminDb()||requireApplied&&!entry.applied)throw new Error('delivery_acceptance_unverified');
  managedPaymentProjection(entry.proof);
  return {order:entry.order,writeCount:entry.writeCount+1,replay:false};
}
/** Only the authenticated dispatch worker calls this; all proof is reread from native storage and Stripe. */
export async function completeManagedDeliveryAcceptance(input:unknown):Promise<boolean>{
  const scope=scopeSchema.parse(input),db=getAdminDb(),ref=db.collection('orders').doc(scope.orderId);
  const initial=(await ref.get()).data();if(!initial)throw new Error('delivery_order_missing');
  const proof=await verifyManagedPaidOrder(scope.orderId,initial);
  return db.runTransaction(async transaction=>{
    const context:NativeTransactionContext=Object.freeze({db,transaction});
    const [orderSnap,attemptSnap,resultSnap,markerSnap,jobSnap,claimSnap,refundSnap]=await Promise.all([transaction.get(ref),transaction.get(ref.collection('deliveryAttempts').doc('original')),
      transaction.get(ref.collection('deliveryDispatchResults').doc('original')),transaction.get(ref.collection('deliveryAcceptance').doc('original')),
      transaction.get(db.collection('deliveryDispatchJobs').doc(scope.orderId)),transaction.get(ref.collection('deliveryDispatch').doc('original')),transaction.get(ref.collection('deliveryRefunds').doc('original'))]);
    const order=orderSnap.data(),managed=managedDeliveryBindingSchema.safeParse(order?.managedDelivery),attempt=bookingIntentSchema.safeParse(attemptSnap.data());
    const claim=claimSnap.data();
    const result=resultSnap.data(),outcome=deliveryCreateResultSchema.safeParse(result?.result),payment=managedPaymentProjection(proof),reference=originalAttemptReference(scope);
    if(!order||!managed.success||!attempt.success||order.brandId!==scope.brandId||order.locationId!==scope.locationId||order.deliveryType!=='Delivery'
      ||order.paymentStatus!=='Paid'||!isDeepStrictEqual(payment.scope,scope)||order.psp?.paymentIntentId!==payment.paymentIntentId
      ||order.psp?.checkoutSessionId!==payment.checkoutSessionId||Math.round(order.totalAmount*100)!==payment.amountMinor
      ||!isDeepStrictEqual(order.managedStripeAccount,payment.binding)||!isDeepStrictEqual(attempt.data.scope,scope)||attempt.data.reference!==reference
      ||attempt.data.intentId!==reference||attempt.data.state!=='booked'||attempt.data.provider!==managed.data.providerId||attempt.data.requestDigest!==managed.data.requestDigest
      ||!result||result.version!==1||!isDeepStrictEqual(result.scope,scope)||result.attemptRef!==reference||result.requestDigest!==managed.data.requestDigest
      ||result.providerId!==managed.data.providerId||!claim||claim.claimId!==result.claimId||!isDeepStrictEqual(claim.scope,scope)||claim.requestDigest!==managed.data.requestDigest||typeof claim.networkStartedAtMs!=='number'||!outcome.success||outcome.data.kind!=='accepted'||outcome.data.providerDeliveryId!==attempt.data.providerDeliveryId)throw new Error('delivery_acceptance_scope');
    const marker={version:1,scope,providerId:managed.data.providerId,providerDeliveryId:attempt.data.providerDeliveryId,requestDigest:managed.data.requestDigest};
    if(markerSnap.exists){const saved=markerSnap.data();if(!saved||!isDeepStrictEqual({version:saved.version,scope:saved.scope,providerId:saved.providerId,providerDeliveryId:saved.providerDeliveryId,requestDigest:saved.requestDigest},marker))throw new Error('delivery_acceptance_conflict');return false;}
    if(refundSnap.exists||order.status!=='Pending'||payment.refundedAmountMinor!==0||order.refundedAmountOre!==undefined&&order.refundedAmountOre!==0
      ||order.refundedAmount!==undefined&&order.refundedAmount!==0||order.refundedAt!=null)throw new Error('delivery_acceptance_ineligible');
    const job=jobSnap.data();if(!job||job.orderId!==scope.orderId||job.brandId!==scope.brandId||job.locationId!==scope.locationId||job.requestDigest!==managed.data.requestDigest)throw new Error('delivery_acceptance_job');
    const confirmationRef=db.collection('orderNotificationJobs').doc(hash(['order-confirmation',scope.brandId,scope.orderId]));
    const marketingRef=db.collection('marketingOrderOutbox').doc(hash(['omnisend-paid-order',scope.brandId,scope.orderId]));
    if(!id.safeParse(order.customerDetails?.id).success)throw new Error('delivery_acceptance_customer');
    const [confirmation,marketing,customer]=await Promise.all([transaction.get(confirmationRef),transaction.get(marketingRef),transaction.get(db.collection('customers').doc(order.customerDetails.id))]);
    if(confirmation.exists||marketing.exists)throw new Error('delivery_acceptance_prior_notification');
    const writes:Array<()=>void>=[],now=Date.now(),stamp=getAdminFieldValue().serverTimestamp();
    writes.push(()=>transaction.update(ref,{status:'Received',deliveryStatus:'booked',updatedAt:stamp}));
    writes.push(()=>transaction.create(ref.collection('deliveryAcceptance').doc('original'),{...marker,acceptedAtMs:now}));
    writes.push(()=>transaction.update(db.collection('deliveryDispatchJobs').doc(scope.orderId),{acceptanceCompletedAtMs:now}));
    writes.push(()=>transaction.create(confirmationRef,{orderId:scope.orderId,brandId:scope.brandId,locationId:scope.locationId,kind:'orderConfirmation',eventId:randomUUID(),state:'pending',attempts:0,nextAttemptAt:now,createdAt:now,updatedAt:now}));
    if(paidOrderMarketingEnabled()&&customer.exists&&customer.data()?.brandId===scope.brandId&&customer.data()?.marketingConsent===true
      &&typeof customer.data()?.email==='string'&&customer.data()!.email.trim().toLowerCase()===String(order.customerContact||'').trim().toLowerCase()&&customer.data()!.email.trim()&&order.invoice?.issuedAt){
      writes.push(()=>transaction.create(marketingRef,{orderId:scope.orderId,brandId:scope.brandId,locationId:scope.locationId,customerId:order.customerDetails.id,
        kind:'paidOrder',eventId:randomUUID(),eventTime:order.invoice.issuedAt,state:'pending',attempts:0,nextAttemptAt:now,createdAt:now,updatedAt:now}));
    }
    const policy=process.env.ORDERFLY_PRINT_INTENTS_ENABLED==='true'?await preparePrintIntentTargetPolicy(context,scope):null;
    let printPlan:Awaited<ReturnType<typeof prepareManagedDeliveryAcceptancePrintIntents>>|undefined;
    let capability:ManagedDeliveryAcceptanceCapability|undefined;
    if(policy?.enabled){
      const [catalog,saved]=await Promise.all([projectNativePrintCatalog(context,scope),prepareSavedPrinterRouting(context,{brandId:scope.brandId,locationId:scope.locationId})]);
      if(saved.revision===null||!saved.rules.length)throw new Error('Saved printer routing required');
      const routing=previewPrinterRouting({scope:catalog.scope,deliveryType:catalog.deliveryType,lines:catalog.lines,rules:saved.rules,printers:saved.printers.map(row=>({configuration:row.configuration,deleted:false}))});
      if(routing.unrouted.length||!routing.targets.length)throw new Error('Order has unrouted print lines');
      const targets:Array<{printerId:string;printerRevision:number;configurationHash:string;kinds:Array<'kitchen'|'packing'>;lineIds:string[]}>=[];
      const intents=routing.targets.flatMap(target=>{
        const selected=policy.targets.find(row=>row.configuration.id===target.printerId),current=saved.printers.find(row=>row.configuration.id===target.printerId);
        if(!selected||!current||selected.printerRevision!==current.revision)throw new Error('Routing target is not enabled');
        targets.push({printerId:target.printerId,printerRevision:selected.printerRevision,configurationHash:hash(selected.configuration),kinds:[...selected.kinds].sort(),lineIds:target.lines.map(line=>line.lineId)});
        return selected.kinds.map(kind=>({brandId:scope.brandId,locationId:scope.locationId,orderId:scope.orderId,printerId:target.printerId,kind}));
      });
      capability=Object.freeze({}) as ManagedDeliveryAcceptanceCapability;
      capabilities.set(capability,{context,order:Object.freeze({id:scope.orderId,brandId:scope.brandId,locationId:scope.locationId,status:'Received',paymentStatus:'Paid',paymentMethod:'Stripe',deliveryType:'Delivery'}),applied:false,writeCount:writes.length,proof});
      printPlan=await prepareManagedDeliveryAcceptancePrintIntents(context,capability,{intents,identity:{schemaVersion:1,id:'original',...scope,originalRevision:0,
        ...(policy.automaticActivationId?{automaticActivationId:policy.automaticActivationId}:{}),policyRevision:policy.policyRevision,routingRevision:saved.revision,
        rulesHash:hash(saved.rules),catalogHash:hash(catalog),targets}});
    }
    for(const write of writes)write();
    if(capability)capabilities.get(capability)!.applied=true;
    printPlan?.apply();
    return true;
  });
}
