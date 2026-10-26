import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { deliveryIdSchema } from '../provider-contract';
import { bookingIntentSchema } from './state';
import type { NormalizedWoltEvent } from '../providers/wolt/events';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const indexSchema=z.object({version:z.literal(1),brandId:deliveryIdSchema,locationId:deliveryIdSchema,orderId:deliveryIdSchema,providerId:z.literal('wolt'),attemptRef:digest,requestDigest:digest,claimId:z.string().uuid(),environment:z.enum(['sandbox','production'])}).strict();
type Callback={brandId:string;locationId:string;merchantId:string;venueId:string;environment:'sandbox'|'production';bindingRevision:number};
/** Internal inbox hook after signature verification and current native callback/binding authorization.
 * A webhook supplies the native order reference, never the distinct provider delivery ID.
 * Retain scoped review evidence without manufacturing acceptance or retrying creation.
 */
export async function retainUnmappedWoltReconciliation(tx:FirebaseFirestore.Transaction,input:{eventId:string;inboxRef:FirebaseFirestore.DocumentReference;callback:Callback;event:NormalizedWoltEvent}):Promise<'pending'|'reconciliation_required'>{
 const {callback,event,inboxRef,eventId}=input;digest.parse(eventId);
 if(!event.merchantOrderReference||!digest.safeParse(event.merchantOrderReference).success)return 'pending';
 const db=getAdminDb(),indexDoc=await tx.get(db.collection('deliveryAttemptReferences').doc(event.merchantOrderReference));
 if(!indexDoc.exists)return 'pending';
 const index=indexSchema.parse(indexDoc.data());
 if(index.brandId!==callback.brandId||index.locationId!==callback.locationId||index.environment!==callback.environment||index.attemptRef!==event.merchantOrderReference||event.nativeVenueId!==null&&event.nativeVenueId!==callback.venueId)throw Error('delivery_reconciliation_scope');
 const orderRef=db.collection('orders').doc(index.orderId),reviewRef=orderRef.collection('deliveryReconciliation').doc('original');
 const [orderDoc,attemptDoc,claimDoc,resultDoc,reviewDoc]=await Promise.all([tx.get(orderRef),tx.get(orderRef.collection('deliveryAttempts').doc('original')),tx.get(orderRef.collection('deliveryDispatch').doc('original')),tx.get(orderRef.collection('deliveryDispatchResults').doc('original')),tx.get(reviewRef)]);
 const order=orderDoc.data(),attempt=bookingIntentSchema.parse(attemptDoc.data()),claim=claimDoc.data(),result=resultDoc.data(),prior=reviewDoc.data();
 const expected=createHash('sha256').update(JSON.stringify(['delivery-original-v1',index.brandId,index.locationId,index.orderId])).digest('hex');
 if(!order||order.brandId!==index.brandId||order.locationId!==index.locationId||order.deliveryType!=='Delivery'||order.managedDelivery?.providerId!=='wolt'||order.managedDelivery.requestDigest!==index.requestDigest
 ||attempt.scope.brandId!==index.brandId||attempt.scope.locationId!==index.locationId||attempt.scope.orderId!==index.orderId||attempt.provider!=='wolt'||attempt.reference!==expected||attempt.reference!==index.attemptRef||attempt.intentId!==index.attemptRef||attempt.requestDigest!==index.requestDigest
 ||!claim||claim.claimId!==index.claimId||claim.attemptRef!==index.attemptRef||claim.requestDigest!==index.requestDigest||claim.environment!==index.environment||claim.scope?.brandId!==index.brandId||claim.scope?.locationId!==index.locationId||claim.scope?.orderId!==index.orderId
 ||claim.binding?.merchantId!==callback.merchantId||claim.binding?.venueId!==callback.venueId||Number(claim.binding?.bindingRevision)!==callback.bindingRevision
 ||!Number.isSafeInteger(claim.networkStartedAtMs)||claim.networkStartedAtMs<0)throw Error('delivery_reconciliation_scope');
 if(attempt.state!=='submitting'&&attempt.state!=='unknown')return 'pending';
 if(!Number.isSafeInteger(claim.revision)||claim.revision<1||attempt.revision!==(attempt.state==='submitting'?claim.revision:claim.revision+1))throw Error('delivery_reconciliation_revision');
 const conflict=prior?.reason==='conflicting_provider_evidence'||Boolean(result&&result.result?.kind!=='unknown')||Boolean(prior&&prior.nativeOrderReference!==event.nativeOrderReference);
 const reason=conflict?'conflicting_provider_evidence':'provider_delivery_id_unavailable';
 if(prior&&(prior.attemptRef!==index.attemptRef||prior.requestDigest!==index.requestDigest||prior.claimId!==index.claimId))throw Error('delivery_reconciliation_conflict');
 const record={version:1,brandId:index.brandId,locationId:index.locationId,orderId:index.orderId,attemptRef:index.attemptRef,requestDigest:index.requestDigest,claimId:index.claimId,environment:index.environment,
 merchantId:callback.merchantId,venueId:callback.venueId,bindingRevision:callback.bindingRevision,nativeOrderReference:prior?.nativeOrderReference??event.nativeOrderReference,providerDeliveryId:null,
 state:'operator_review_required',reason,eventId:prior?.eventId??eventId,lastEventId:eventId,rawStatus:event.rawStatus,updatedAtMs:Date.now()};
 tx.set(reviewRef,record);
 tx.update(orderRef,{deliveryReconciliationRequired:true});
 tx.update(inboxRef,{state:'reconciliation_required',reconciliationOrderId:index.orderId,reconciliationReason:reason});
 return 'reconciliation_required';
}
