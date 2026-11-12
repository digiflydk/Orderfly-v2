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

/** Durable single-field due queue: terminal orders leave the queue, failures move
 * forward, and old unrelated orders cannot occupy a prefiltered page forever.
 * The checkout writer creates this job atomically with each Worldline order.
 */
export async function processWorldlineStaleCheckouts(options:{db?:FirebaseFirestore.Firestore;now?:()=>number;cancel?:typeof cancelWorldlineCheckout}={}){
  const db=options.db??getAdminDb(),now=(options.now??Date.now)(),result={inspected:0,released:0};
  const rows=await db.collection('worldlineCheckoutExpiryJobs').where('nextAttemptAt','<=',now).orderBy('nextAttemptAt').limit(1).get();
  for(const job of rows.docs){
    const data=job.data();result.inspected++;
    const update=async(terminal:boolean)=>db.runTransaction(async tx=>{
      const current=await tx.get(job.ref);if(!current.exists||current.data()?.nextAttemptAt!==data.nextAttemptAt)return;
      if(terminal){tx.delete(job.ref);return;}
      const attempts=Math.min(1000,Math.max(0,Number(data.attempts)||0)+1);
      tx.update(job.ref,{attempts,nextAttemptAt:now+Math.min(15*60*1000,60000*2**Math.min(attempts-1,4)),lastAttemptAt:now,state:'reconciliation_required'});
    });
    if(data.orderId!==job.id||!['orderId','brandId','locationId'].every(key=>typeof data[key]==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(data[key]))){await update(true);continue;}
    try{
      const order=(await db.collection('orders').doc(data.orderId).get()).data();
      if(!order||order.brandId!==data.brandId||order.locationId!==data.locationId||order.psp?.provider!=='worldline'||order.paymentMethod!=='Worldline'||order.paymentStatus==='Paid'||order.discountReservation==='released'){
        await update(true);continue;
      }
      const status=await (options.cancel??cancelWorldlineCheckout)(job.id);
      if(status==='canceled'){result.released++;await update(true);}
      else if(status==='paid')await update(true);
      else await update(false);
    }catch{await update(false);}
  }
  return result;
}
