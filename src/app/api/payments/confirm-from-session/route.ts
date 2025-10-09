
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getActiveStripeSecretKey } from '@/app/superadmin/settings/actions';

export async function POST(req: NextRequest) {
  try {
    const { orderId, sessionId } = await req.json();
    if (!orderId || !sessionId) return NextResponse.json({ ok:false, error:'missing_params' }, { status:400 });

    const stripeKey = await getActiveStripeSecretKey();
    if (!stripeKey) {
        throw new Error("Stripe is not configured.");
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const ref = doc(db, 'orders', orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return NextResponse.json({ ok:false, error:'order_not_found' }, { status:404 });

    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

    if (paid) {
      await updateDoc(ref, {
        paymentStatus: 'Paid',
        paidAt: serverTimestamp(),
        psp: { ...(snap.data().psp || {}), provider:'stripe', checkoutSessionId: session.id, ...(piId ? { paymentIntentId: piId } : {}) },
        updatedAt: serverTimestamp(),
      });
      return NextResponse.json({ ok:true, status:'Paid', orderId });
    }

    return NextResponse.json({ ok:true, status:'Pending', orderId });
  } catch (e:any) {
    console.error('confirm-from-session error', e?.message);
    return NextResponse.json({ ok:false, error:'server_error' }, { status:500 });
  }
}

    