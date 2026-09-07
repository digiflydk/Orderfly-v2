import 'server-only';
import {getAdminDb} from './admin';
// Only this isolated test application swaps Stripe. Production actions/ledger stay real.
export default class Stripe {
  coupons={create:async(params:any)=>({id:'local_coupon',...params})};
  checkout={sessions:{create:async(params:any)=>{
    const orderId=params.metadata.orderId;
    const order=(await getAdminDb().doc('orders/'+orderId).get()).data()!;
    const session={id:'cs_'+orderId,created:Math.floor(Date.now()/1000),metadata:params.metadata,status:'complete',payment_status:'paid',currency:'dkk',amount_total:Math.round(order.totalAmount*100),payment_intent:'pi_'+orderId};
    await getAdminDb().doc('qa_sessions/'+orderId).create(session);
    return {...session,url:'/paid?order='+orderId};
  }}};
}
