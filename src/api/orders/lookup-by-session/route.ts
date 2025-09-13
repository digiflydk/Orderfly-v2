
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, Timestamp, doc, getDoc } from 'firebase/firestore';
import Stripe from 'stripe';
import { getActiveStripeSecretKey } from '@/app/superadmin/settings/actions';
import type { OrderDetail } from '@/types';

async function getOrder(orderId: string): Promise<OrderDetail | null> {
    const docRef = doc(db, "orders", orderId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            createdAt: (data.createdAt as Timestamp).toDate(),
            paidAt: (data.paidAt as Timestamp)?.toDate(),
        } as OrderDetail;
    }
    return null;
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ found: false, reason: 'missing_session_id' }, { status: 400 });

  try {
    // Attempt to find order by session ID first
    const q = query(collection(db, 'orders'), where('psp.checkoutSessionId', '==', sessionId), limit(1));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        const orderDoc = querySnapshot.docs[0];
        const orderData = await getOrder(orderDoc.id);
        if (orderData) {
            return NextResponse.json({ found: true, orderId: orderData.id, order: orderData });
        }
    }
    
    // If not found, check Stripe directly (fallback)
    const stripeKey = await getActiveStripeSecretKey();
    if (!stripeKey) {
        throw new Error("Stripe is not configured.");
    }
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (!session.metadata?.orderId) {
        return NextResponse.json({ found: false, reason: 'missing_order_id_in_metadata' }, { status: 400 });
    }
    
    const order = await getOrder(session.metadata.orderId);

    if (order) {
        return NextResponse.json({ found: true, orderId: order.id, order: order });
    }
    
    // If Stripe session is paid but order not in DB yet (unlikely with new flow, but safe), tell client to keep polling
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    return NextResponse.json({ found: false, pending: paid });
    
  } catch (err: any) {
    console.error(`Stripe lookup failed for session ${sessionId}:`, err);
    return NextResponse.json({ found: false, error: err?.message || 'stripe_lookup_failed' }, { status: 500 });
  }
}
