import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { settleFreeCheckoutOrder } from '@/lib/server/settle-checkout';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const scopeSchema=z.object({orderId:id,brandId:id,locationId:id});
const outsideDueRange=8640000000000000;
/** Existing authenticated worker heartbeat only. Never resolves a payment provider or reads credentials. */
export async function processDueNativeFreeCheckouts(){
  const db=getAdminDb(),now=Date.now();
  const due=await db.collection('freeCheckoutSettlementJobs').where('nextAttemptAt','<=',now).orderBy('nextAttemptAt').limit(1).get();
  let settled=0;
  for(const job of due.docs){
    try{
      const scope=scopeSchema.parse(job.data());
      if(job.id!==scope.orderId)throw Error('free_recovery_scope');
      const order=(await db.collection('orders').doc(scope.orderId).get()).data();
      if(!order||order.brandId!==scope.brandId||order.locationId!==scope.locationId||order.paymentMethod!=='Free'||order.psp||order.paymentAgreement)throw Error('free_recovery_scope');
      if(order.status==='Canceled'){
        await job.ref.update({state:'canceled',nextAttemptAt:outsideDueRange,updatedAt:Date.now()});continue;
      }
      await settleFreeCheckoutOrder(scope.orderId);
      // A lost queue-finalization reply only repeats idempotent native settlement on the next heartbeat.
      await db.runTransaction(async tx=>{
        const [current,paid]=await Promise.all([tx.get(job.ref),tx.get(db.collection('orders').doc(scope.orderId))]);
        const saved=current.data(),value=paid.data();
        if(!saved||saved.orderId!==scope.orderId||saved.brandId!==scope.brandId||saved.locationId!==scope.locationId||!value
          ||value.brandId!==scope.brandId||value.locationId!==scope.locationId||value.paymentMethod!=='Free'||value.paymentStatus!=='Paid')throw Error('free_recovery_not_settled');
        tx.update(job.ref,{state:'settled',nextAttemptAt:outsideDueRange,updatedAt:Date.now()});
      });settled++;
    }catch{
      await db.runTransaction(async tx=>{
        const current=(await tx.get(job.ref)).data();if(!current||current.state==='settled'||current.state==='canceled')return;
        const attempts=Math.min(30,Math.max(0,Number(current.attempts)||0)+1);
        tx.update(job.ref,{state:'pending',attempts,nextAttemptAt:Date.now()+Math.min(60000*2**(attempts-1),3600000),error:'free_checkout_reconciliation_required',updatedAt:Date.now()});
      });
    }
  }
  return {inspected:due.size,settled};
}
