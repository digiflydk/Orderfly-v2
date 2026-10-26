'use server';

import { createHash } from 'node:crypto';
import Stripe from 'stripe';
import { doc, getDoc } from '@/lib/server/firestore-compat';
import { db } from '@/lib/server/firestore-compat';
import { getActiveStripeSecretKey } from '@/lib/server/payment-settings';
import { releaseDiscount } from '@/lib/discount-reservations';

export async function cancelCheckout(orderId: string, token: string): Promise<{ status: 'canceled' | 'paid' | 'error' }> {
  try {
    if (!/^ORD-[A-Za-z0-9-]+$/.test(orderId) || !/^[a-f0-9]{64}$/.test(token)) return { status: 'error' };
    const snapshot = await getDoc(doc(db, 'orders', orderId));
    if (!snapshot.exists()) return { status: 'error' };
    const order = snapshot.data();
    if (createHash('sha256').update(token).digest('hex') !== order.cancelTokenHash) return { status: 'error' };
    if (order.paymentStatus === 'Paid') return { status: 'paid' };
    const sessionId = order.psp?.checkoutSessionId;
    if (!sessionId) return { status: 'error' };
    let stripe: Stripe;
    let expectedLivemode: boolean | undefined;
    if (order.managedDelivery) {
      if (order.psp?.provider !== 'stripe' || order.deliveryType !== 'Delivery') return { status: 'error' };
      const { managedStripeAccountSchema, resolveManagedStripeGateway } = await import('@/lib/delivery/payments/stripe-authority');
      const expected = managedStripeAccountSchema.parse(order.managedStripeAccount);
      const gateway = await resolveManagedStripeGateway(expected.livemode ? 'production' : 'sandbox');
      if (gateway.binding.accountId !== expected.accountId || gateway.binding.livemode !== expected.livemode) return { status: 'error' };
      stripe = gateway.stripe;
      expectedLivemode = expected.livemode;
    } else {
      const key = await getActiveStripeSecretKey();
      if (!key) return { status: 'error' };
      stripe = new Stripe(key);
    }
    const matchesOrder = (session: Stripe.Checkout.Session) => session.id === sessionId
      && !!order.brandId && !!order.locationId
      && session.metadata?.orderId === orderId && session.metadata?.brandId === order.brandId
      && session.metadata?.locationId === order.locationId
      && (expectedLivemode === undefined || session.livemode === expectedLivemode);
    let session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!matchesOrder(session)) return { status: 'error' };
    if (session.payment_status === 'paid') return { status: 'paid' };
    if (session.status === 'open') {
      try { session = await stripe.checkout.sessions.expire(sessionId); }
      catch { session = await stripe.checkout.sessions.retrieve(sessionId); }
    }
    if (!matchesOrder(session)) return { status: 'error' };
    if (session.payment_status === 'paid') return { status: 'paid' };
    if (session.status !== 'expired') return { status: 'error' };
    await releaseDiscount(orderId, order.brandId, sessionId, order.locationId);
    return { status: 'canceled' };
  } catch {
    return { status: 'error' };
  }
}
