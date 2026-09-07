import 'server-only';
import type Stripe from 'stripe';
import { doc,runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { refundRewards } from '@/lib/loyalty/rewards';

// Stripe's cumulative refund amount makes repeated and older events harmless.
export async function processRefund(charge:Stripe.Charge) {
  const {orderId,brandId,locationId}=charge.metadata||{};
  if(!orderId || !brandId || !locationId)return;
  const pi=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id;
  await runTransaction(db,async tx=>{
    const ref=doc(db,'orders',orderId),snap=await tx.get(ref);
    if(!snap.exists())throw new Error('Refund order missing');
    const order=snap.data(),total=Math.round(order.totalAmount*100);
    if(order.brandId!==brandId||order.locationId!==locationId||charge.currency!=='dkk'||charge.amount!==total||(order.psp?.paymentIntentId && order.psp.paymentIntentId!==pi))throw new Error('Refund payment scope mismatch');
    const refunded=Math.max(order.refundedAmountOre||0,charge.amount_refunded);
    if(!Number.isSafeInteger(refunded)||refunded>total||refunded<0)throw new Error('Refund amount invalid');
    if(refunded===(order.refundedAmountOre||0))return;
    const customerRef=doc(db,'customers',order.customerDetails.id),customer=await tx.get(customerRef);
    if(customer.exists() && customer.data().brandId!==brandId)throw new Error('Refund customer scope mismatch');
    if(order.paymentStatus==='Paid' && customer.exists())tx.update(customerRef,{
      totalSpend:Math.max(0,(customer.data().totalSpend||0)-(refunded-(order.refundedAmountOre||0))/100),
      totalOrders:Math.max(0,(customer.data().totalOrders||0)-(refunded===total?1:0)),
    });
    tx.update(ref,{refundedAmountOre:refunded,'psp.paymentIntentId':pi||null});
  });
  await refundRewards(orderId,brandId,charge.amount_refunded);
}
