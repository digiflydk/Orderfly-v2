import { managedDeliveryBindingSchema, deliveryCreateResultSchema, deliveryIntervalSchema } from './provider-contract';
import { bookingIntentSchema } from './booking/state';
export type CustomerDeliveryTracking = {
 orderId:string; bookingState:'pending'|'submitting'|'accepted'|'rejected'|'unknown';
 deliveryStatus:'booked'|'courier_assigned'|'courier_to_pickup'|'picked_up'|'delivered'|'cancelled'|'failed'|null;
 paymentStatus:'pending'|'paid'|'refunded'|'failed';trackingUrl:string|null;
 deliveryInterval:{earliest:string;latest:string}|null;pickupInterval:{earliest:string;latest:string}|null;pickupReliable:boolean;updatedAt:string|null;
};
const statuses=['booked','courier_assigned','courier_to_pickup','picked_up','delivered','cancelled','failed'];
const row=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const interval=(v:unknown)=>{const p=deliveryIntervalSchema.safeParse(v);return p.success?p.data:null;};
/** Safe DTO only. Call exclusively after native order authorization; this function does not authorize. */
export function projectCustomerDeliveryTracking(orderId:string,rawOrder:unknown,rawAttempt:unknown,rawResult:unknown,rawState:unknown,rawEstimates:unknown=null):CustomerDeliveryTracking|null{
 const order=row(rawOrder),managed=managedDeliveryBindingSchema.safeParse(order.managedDelivery);
 if(!managed.success||order.deliveryType!=='Delivery')return null;
 const attempt=bookingIntentSchema.safeParse(rawAttempt),resultRecord=row(rawResult),state=row(rawState),estimates=row(rawEstimates);
 const bound=attempt.success&&attempt.data.scope.brandId===order.brandId&&attempt.data.scope.locationId===order.locationId&&attempt.data.scope.orderId===orderId&&attempt.data.provider===managed.data.providerId&&attempt.data.requestDigest===managed.data.requestDigest;
 const parsedResult=deliveryCreateResultSchema.safeParse(resultRecord.result);
 const boundResult=bound&&parsedResult.success&&resultRecord.scope?.brandId===order.brandId&&resultRecord.scope?.locationId===order.locationId&&resultRecord.scope?.orderId===orderId&&resultRecord.providerId===managed.data.providerId&&resultRecord.requestDigest===managed.data.requestDigest&&resultRecord.attemptRef===attempt.data.reference;
 const accepted=boundResult&&parsedResult.data.kind==='accepted'&&attempt.data.state==='booked'&&attempt.data.providerDeliveryId===parsedResult.data.providerDeliveryId?parsedResult.data:null;
 const boundState=!!accepted&&state.brandId===order.brandId&&state.locationId===order.locationId&&state.orderId===orderId&&state.provider===managed.data.providerId&&state.providerDeliveryId===accepted.providerDeliveryId;
 const nativeStatus=boundState&&statuses.includes(state.status)?state.status as CustomerDeliveryTracking['deliveryStatus']:accepted?'booked':null;
 const boundEstimates=!!accepted&&estimates.brandId===order.brandId&&estimates.locationId===order.locationId&&estimates.orderId===orderId&&estimates.provider===managed.data.providerId&&estimates.providerDeliveryId===accepted.providerDeliveryId;
 const eta=boundEstimates?interval(estimates.dropoff):null,pickup=boundEstimates?interval(estimates.pickup):null;
 
 const updated=Math.max(bound?attempt.data.updatedAt:0,boundEstimates&&Number.isSafeInteger(estimates.dispatchedAtMs)&&estimates.dispatchedAtMs>=0?estimates.dispatchedAtMs:0);
 return {orderId,bookingState:bound?(attempt.data.state==='booked'?'accepted':attempt.data.state):rawAttempt?'unknown':'pending',deliveryStatus:nativeStatus,
 paymentStatus:order.paymentStatus==='Refunded'||typeof order.totalAmount==='number'&&order.totalAmount>0&&Number.isSafeInteger(order.refundedAmountOre)&&order.refundedAmountOre>=Math.round(order.totalAmount*100)?'refunded':order.paymentStatus==='Paid'?'paid':order.paymentStatus==='Failed'?'failed':'pending',
 trackingUrl:accepted?.trackingUrl??null,deliveryInterval:eta??accepted?.deliveryInterval??null,pickupInterval:pickup??accepted?.pickupInterval??null,
 pickupReliable:!!pickup&&estimates.pickupReliable===true,updatedAt:updated>0&&Number.isFinite(new Date(updated).getTime())?new Date(updated).toISOString():null};
}
