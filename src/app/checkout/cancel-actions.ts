'use server';

import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { getAdminDb } from '@/lib/firebase-admin';
import { getActiveStripeSecretKey } from '@/lib/payments/settings';
import { releaseDiscount } from '@/lib/discount-reservations';

export async function cancelCheckout(orderId: string, token: string): Promise<{ status: 'canceled' | 'paid' | 'error' }> {
  try {
    if (!/^ORD-[A-Za-z0-9-]+$/.test(orderId) || !/^[a-f0-9]{64}$/.test(token)) return { status: 'error' };
    const snapshot = await getAdminDb().collection('orders').doc(orderId).get();
    if (!snapshot.exists) return { status: 'error' };
    const order = snapshot.data()!;
    if (createHash('sha256').update(token).digest('hex') !== order.cancelTokenHash) return { status: 'error' };
    if (order.paymentStatus === 'Paid') return { status: 'paid' };
    const sessionId = order.psp?.checkoutSessionId;
    if (!sessionId) return { status: 'error' };
    const key = await getActiveStripeSecretKey();
    if (!key) return { status: 'error' };
    const stripe = new Stripe(key);
    let session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.orderId !== orderId || session.metadata?.brandId !== order.brandId || session.metadata?.locationId !== order.locationId) return { status: 'error' };
    if (session.status === 'open') {
      try { session = await stripe.checkout.sessions.expire(sessionId); }
      catch { session = await stripe.checkout.sessions.retrieve(sessionId); }
    }
    if (session.status === 'complete' || session.payment_status === 'paid') return { status: 'paid' };
    if (session.status !== 'expired') return { status: 'error' };
    await releaseDiscount(orderId, order.brandId, sessionId);
    return { status: 'canceled' };
  } catch {
    return { status: 'error' };
  }
}
