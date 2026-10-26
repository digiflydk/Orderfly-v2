import 'server-only';
import {getAdminDb} from '@/lib/firebase-admin';
import {deliveryDispatchEnabled} from './settings/server';
import {deliveryMerchantRecordSchema,deliveryMerchantId} from './management/schema';
export type DeliveryRuntimeEnvironment='sandbox'|'production';
type Scope={brandId:string;locationId:string};
type Purpose='new'|'recovery'|'callback'|'cancel';
/** Native enrollment is trusted server configuration, never a customer-supplied gate. */
export async function deliveryScopeRuntimeAllowed(scope:Scope,environment:DeliveryRuntimeEnvironment,purpose:Purpose,tx?:FirebaseFirestore.Transaction):Promise<boolean>{
 try{
  const ref=getAdminDb().collection('deliveryMerchantEnrollments').doc(deliveryMerchantId(scope,environment));
  const row=tx?await tx.get(ref):await getAdminDb().runTransaction(t=>t.get(ref),{readOnly:true});
  if(row.exists){
   const parsed=deliveryMerchantRecordSchema.safeParse(row.data());
   if(!parsed.success)return false;
   const c=parsed.data;
   return c.id===deliveryMerchantId(scope,environment)&&c.brandId===scope.brandId&&c.locationId===scope.locationId&&c.environment===environment
    &&c.provisioned&&!!c.secretRefs.api&&!!c.secretRefs.webhook
    &&(environment!=='production'||c.productionApproved===true)
    &&(purpose==='new'?c.status==='active'&&c.connectionStatus==='verified'&&c.callbackStatus==='registered':['active','inactive','archived'].includes(c.status));
  }
  // Existing explicitly configured installations retain their gates until enrolled.
  if(environment==='production'&&process.env.ORDERFLY_DELIVERY_PRODUCTION_ENABLED!=='true')return false;
  if(purpose==='callback')return process.env.ORDERFLY_DELIVERY_CALLBACK_ENABLED==='true';
  if(purpose==='cancel')return process.env.ORDERFLY_DELIVERY_CANCELLATION_ENABLED==='true';
  return deliveryDispatchEnabled()&&process.env.ORDERFLY_DELIVERY_ENVIRONMENT===environment
   &&(purpose!=='new'||process.env.ORDERFLY_DELIVERY_CHECKOUT_ENABLED==='true'&&process.env.ORDERFLY_DELIVERY_ROUTING_ENABLED==='true');
 }catch{return false;}
}
export async function enrolledDeliveryEnvironment(scope:Scope):Promise<DeliveryRuntimeEnvironment|null>{
 try{
  const {createHash}=await import('node:crypto');
  const key=createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId])).digest('hex');
  const row=await getAdminDb().runTransaction(tx=>tx.get(getAdminDb().collection('deliveryRuntimeConfigs').doc(key)),{readOnly:true});
  const c=row.data();
  if(!row.exists||c?.scope?.brandId!==scope.brandId||c?.scope?.locationId!==scope.locationId||!['sandbox','production'].includes(c.environment))return null;
  return await deliveryScopeRuntimeAllowed(scope,c.environment,'new')?c.environment:null;
 }catch{return null;}
}
