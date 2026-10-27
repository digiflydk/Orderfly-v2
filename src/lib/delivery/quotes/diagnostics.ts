import 'server-only';
import {createHash} from 'node:crypto';
import {getAdminDb} from '@/lib/firebase-admin';
import {quoteDiagnosticSchema,type QuoteDiagnostic} from './diagnostic-schema';
export const quoteDiagnosticId=(scope:{brandId:string;locationId:string})=>createHash('sha256').update(JSON.stringify([scope.brandId,scope.locationId])).digest('hex');
/** One bounded report per adopted restaurant, no customer data, secrets or raw errors. */
export async function recordQuoteDiagnostic(scope:{brandId:string;locationId:string},diagnostic:QuoteDiagnostic){
 try{
  if(![scope.brandId,scope.locationId].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)))return;
  const value=quoteDiagnosticSchema.parse(diagnostic),db=getAdminDb(),key=quoteDiagnosticId(scope);
  await db.runTransaction(async tx=>{
   const ref=db.collection('deliveryQuoteDiagnostics').doc(key);
   const [location,adoption,previous]=await Promise.all([tx.get(db.collection('locations').doc(scope.locationId)),tx.get(db.collection('deliveryAdoptions').doc(key)),tx.get(ref)]);
   if(location.data()?.brandId!==scope.brandId||adoption.data()?.mode!=='managed'||adoption.data()?.brandId!==scope.brandId||adoption.data()?.locationId!==scope.locationId)return;
   if(previous.exists&&value.atMs-(previous.data()?.atMs??0)<5000)return;
   tx.set(ref,{...scope,...value});
  });
 }catch{ /* Diagnostics must never change checkout acceptance or expose internal errors. */ }
}
