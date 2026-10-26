import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import { getAdminDb } from '@/lib/firebase-admin';
import { managedDeliveryCompletionSchema } from './delivery-completion';
import { completedFeedbackOrder } from './order-invitations';
import { queueOrderFeedback } from './mail-queue';
/** Recoverable queue bridge only; no provider delivery or customer email is sent here. */
export async function drainDeliveryFeedbackRequests(now=Date.now()){
 const db=getAdminDb(),rows=await db.collection('deliveryFeedbackRequests').where('nextAttemptAt','<=',now).orderBy('nextAttemptAt').limit(10).get();
 for(const row of rows.docs){
  const ref=db.collection('deliveryFeedbackRequests').doc(row.id),request=row.data();
  if(request.state!=='pending')continue;
  try{
   const marker=managedDeliveryCompletionSchema.safeParse(request.completion);
   const order=marker.success?(await db.collection('orders').doc(row.id).get()).data():null;
   const bound=marker.success&&marker.data.orderId===row.id&&order&&isDeepStrictEqual(order.managedDeliveryCompletion,marker.data);
   // Provider delivery may beat the separate paid-order acceptance transaction.
   // Defer that Pending state; it is not permission to send or permanent suppression.
   if(bound&&order.status==='Pending'&&completedFeedbackOrder({...order,status:'Ready'},row.id)){
    await db.runTransaction(async tx=>{const fresh=(await tx.get(ref)).data();if(fresh?.state==='pending')tx.update(ref,{nextAttemptAt:now+60000,updatedAtMs:Date.now()});});continue;
   }
   const eligible=bound&&completedFeedbackOrder(order,row.id);
   const jobId=eligible?await queueOrderFeedback(row.id,true):null;
   await db.runTransaction(async tx=>{const fresh=(await tx.get(ref)).data();if(fresh?.state==='pending'&&isDeepStrictEqual(fresh.completion,request.completion))tx.update(ref,{state:jobId?'queued':'suppressed',nextAttemptAt:Number.MAX_SAFE_INTEGER,updatedAtMs:Date.now()});});
  }catch{
   // Move failed rows behind later due requests; retry after configuration/storage recovery.
   await db.runTransaction(async tx=>{const fresh=(await tx.get(ref)).data();if(fresh?.state==='pending')tx.update(ref,{nextAttemptAt:now+60000,updatedAtMs:Date.now(),lastError:'feedback_queue_unavailable'});}).catch(()=>undefined);
  }
 }
}
