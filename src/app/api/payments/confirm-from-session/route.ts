import { NextRequest,NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getActiveStripeSecretKey } from '@/app/superadmin/settings/actions';
import { fulfillPaidSession } from '@/lib/payments/settlement';

export async function POST(req:NextRequest) {
  try {
    const {orderId,sessionId}=await req.json();
    if(typeof orderId!=='string'||typeof sessionId!=='string'||!sessionId.startsWith('cs_'))return NextResponse.json({ok:false},{status:400});
    const key=await getActiveStripeSecretKey();if(!key)throw new Error('Stripe not configured');
    const session=await new Stripe(key).checkout.sessions.retrieve(sessionId);
    if(session.metadata?.orderId!==orderId)return NextResponse.json({ok:false},{status:403});
    await fulfillPaidSession(session);
    const paid=session.payment_status==='paid'||(session.status==='complete'&&session.amount_total===0&&session.payment_status==='no_payment_required');
    return NextResponse.json({ok:true,status:paid?'Paid':'Pending',orderId});
  } catch {return NextResponse.json({ok:false,error:'confirmation_failed'},{status:500});}
}
