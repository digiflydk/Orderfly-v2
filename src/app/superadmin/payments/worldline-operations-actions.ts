'use server';
import { z } from 'zod';
import { orderflySession } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { getAdminDb } from '@/lib/firebase-admin';
import { runWorldlineOperation } from '@/lib/payments/worldline-operations';
const inputSchema=z.object({orderId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),requestId:z.string().uuid(),operation:z.enum(['credit','delete']),amountMinor:z.number().int().positive().max(2147483647).optional()}).strict();
/** Authenticated admin entry; no provider reference, actor or credentials come from the browser. */
export async function worldlineOrderOperation(input:unknown){
  const parsed=inputSchema.parse(input),actor=await orderflySession(),db=getAdminDb();
  const transactionId=await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(db.collection('orders').doc(parsed.orderId)),order=snapshot.data();
    if(!order)throw Error('Ordren findes ikke.');
    await authorizeTransaction(transaction,actor.identity,order,'orderfly.orders:edit','location');
    if(order.psp?.provider!=='worldline'||!order.psp.transactionId)throw Error('Ordren har ingen Worldline-betaling.');
    if(parsed.operation==='credit'&&order.paymentStatus!=='Paid')throw Error('Kun hævede betalinger kan refunderes.');
    return order.psp.transactionId as string;
  });
  try{return await runWorldlineOperation({...parsed,transactionId,actorId:actor.actorId});}
  catch{throw Error('Betalingsoperationen kunne ikke bekræftes. Kontrollér status før en ny anmodning.');}
}
