import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {getAdminDb} from '@/lib/firebase-admin';
const markerSchema=z.object({version:z.literal(1),brandId:z.string(),locationId:z.string(),mode:z.literal('managed')}).strict();
export function deliveryAdoptionKey(scope:{brandId:string;locationId:string}){return createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId])).digest('hex');}
/** Activation is separate from preparatory settings. Uncertain state blocks checkout and never enables a runtime. */
export async function readManagedDeliveryAdoption(scope:{brandId:string;locationId:string}):Promise<'legacy'|'managed'|'unavailable'>{
 try{return await getAdminDb().runTransaction(async tx=>{
  const location=await tx.get(getAdminDb().collection('locations').doc(scope.locationId));
  if(!location.exists||location.data()?.brandId!==scope.brandId)throw Error('delivery_scope_invalid');
  const marker=await tx.get(getAdminDb().collection('deliveryAdoptions').doc(deliveryAdoptionKey(scope)));
  if(!marker.exists)return 'legacy';
  const value=markerSchema.parse(marker.data());
  if(value.brandId!==scope.brandId||value.locationId!==scope.locationId)throw Error('delivery_adoption_scope_invalid');
  return 'managed';
 });}catch{return 'unavailable';}
}
export async function managedDeliveryRequired(scope:{brandId:string;locationId:string}):Promise<boolean>{return await readManagedDeliveryAdoption(scope)!=='legacy';}
