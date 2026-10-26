import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { deliveryIdSchema } from './provider-contract';
import { projectCustomerDeliveryTracking } from './tracking';
/** Internal transaction projection. Caller has already authorized this exact native order snapshot. */
export async function loadAuthorizedDeliveryTracking(tx:FirebaseFirestore.Transaction,orderId:string,order:Record<string,any>){
 if(!order.managedDelivery)return null;
 deliveryIdSchema.parse(orderId);
 const ref=getAdminDb().collection('orders').doc(orderId);
 const [attempt,result,state,estimates]=await Promise.all([tx.get(ref.collection('deliveryAttempts').doc('original')),tx.get(ref.collection('deliveryDispatchResults').doc('original')),tx.get(ref.collection('deliveryState').doc('current')),tx.get(ref.collection('deliveryEstimates').doc('current'))]);
 return projectCustomerDeliveryTracking(orderId,order,attempt.data(),result.data(),state.data(),estimates.data());
}
/** Receipt-only helper, never a server action. Receipt proof was checked by readGuestReceipt. */
export async function readReceiptDeliveryTracking(verifiedOrder:Record<string,any>){
 if(!verifiedOrder.managedDelivery)return null;
 deliveryIdSchema.parse(verifiedOrder.id);
 return getAdminDb().runTransaction(async tx=>{
  const native=(await tx.get(getAdminDb().collection('orders').doc(verifiedOrder.id))).data();
  if(!native||native.brandId!==verifiedOrder.brandId||native.locationId!==verifiedOrder.locationId||native.receiptTokenHash!==verifiedOrder.receiptTokenHash||native.psp?.checkoutSessionId!==verifiedOrder.psp?.checkoutSessionId)return null;
  return loadAuthorizedDeliveryTracking(tx,verifiedOrder.id,native);
 },{readOnly:true});
}
