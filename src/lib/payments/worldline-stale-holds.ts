import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { cancelWorldlineCheckout } from './worldline-expiry';

// Expire abandoned windows after the existing checkout hold lifetime. Time only
// selects candidates: provider-confirmed session expiry or void authorizes release.
const HOLD_AGE_MS=31*60*1000;
function timestamp(value:unknown):number|null{
  if(value instanceof Date)return value.getTime();
  if(value&&typeof (value as {toMillis?:unknown}).toMillis==='function')return (value as {toMillis:()=>number}).toMillis();
  return null;
}
export async function reconcileWorldlineStaleHolds(brandId:string,discountId:string,options:{db?:FirebaseFirestore.Firestore;now?:()=>number;deadline?:number;cancel?:typeof cancelWorldlineCheckout}={}){
  const result={inspected:0,released:0,settled:0};
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)||!discountId)return result;
  const db=options.db??getAdminDb(),now=options.now??Date.now;
  const deadline=options.deadline??now()+6000;
  try{
    if(deadline-now()<5000)return result;
    const rows=await db.collection('orders').where('brandId','==',brandId).where('appliedDiscountId','==',discountId).where('discountReservation','==','held').where('paymentMethod','==','Worldline').limit(50).get();
    const candidates=rows.docs.filter(row=>{
      const order=row.data(),created=timestamp(order.createdAt);
      return order.brandId===brandId&&order.appliedDiscountId===discountId&&order.paymentMethod==='Worldline'&&order.psp?.provider==='worldline'&&order.discountReservation==='held'&&order.paymentStatus!=='Paid'&&created!==null&&now()-created>HOLD_AGE_MS;
    });
    // One bounded provider expiry per foreground checkout. The recurring worker
    // and future attempts can recover the rest without a long request stall.
    for(const row of candidates.slice(0,1)){
      if(deadline-now()<5000)break;
      result.inspected++;
      try{
        const status=await (options.cancel??cancelWorldlineCheckout)(row.id);
        if(status==='canceled')result.released++;
      }catch{/* Unknown provider state keeps the hold and native operation lock. */}
    }
  }catch{/* Reservation enforcement remains authoritative on a read/provider outage. */}
  return result;
}

/** Existing authenticated heartbeat may expire one abandoned Worldline window,
 * including orders without a promotion code. No state is inferred from age.
 */
export async function processWorldlineStaleCheckouts(){
  const db=getAdminDb(),now=Date.now(),result={inspected:0,released:0};
  const rows=await db.collection('orders').where('paymentMethod','==','Worldline').where('paymentStatus','==','Pending').limit(50).get();
  const candidates=rows.docs.filter(row=>{const order=row.data(),created=timestamp(order.createdAt);return order.psp?.provider==='worldline'&&typeof order.psp.checkoutSessionId==='string'&&order.discountReservation==='held'&&created!==null&&now-created>HOLD_AGE_MS;});
  for(const row of candidates.slice(0,1)){result.inspected++;try{if(await cancelWorldlineCheckout(row.id)==='canceled')result.released++;}catch{/* Next heartbeat retries the same terminal expiry/void only. */}}
  return result;
}
