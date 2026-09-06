import { releaseDiscount } from '@/lib/discount-reservations';

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getActiveStripeSecretKey, getActiveStripeWebhookSecret } from '@/app/superadmin/settings/actions';
import { headers } from 'next/headers';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, runTransaction, collection, where, query } from 'firebase/firestore';
import { trackServerEvent } from '@/lib/analytics-server';


export const runtime = "nodejs";

export async function POST(req: Request) {
  const headerList = await headers();
  const sig = headerList.get('stripe-signature');
  const rawBody = await req.text();
  
  let event: Stripe.Event;
  let stripe: Stripe;

  try {
    const stripeKey = await getActiveStripeSecretKey();
    const webhookSecret = await getActiveStripeWebhookSecret();

    if (!stripeKey || !webhookSecret) {
        console.error('Stripe keys or webhook secret not configured.');
        return new Response('Stripe not configured', { status: 500 });
    }
    
    if (!sig) {
        console.error('No Stripe signature found in headers.');
        return new Response('No signature', { status: 400 });
    }
    
    stripe = new Stripe(stripeKey);
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Webhook signature verification failed: ${errorMessage}`);
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.expired': {
      const expired = event.data.object as Stripe.Checkout.Session;
      if (expired.metadata?.orderId && expired.metadata?.brandId) {
        try { await releaseDiscount(expired.metadata.orderId, expired.metadata.brandId, expired.id); }
        catch { return new Response('Reservation release failed', { status: 500 }); }
      }
      break;
    }
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      
      try {
        const metadata = session.metadata;
        if (!metadata || !metadata.orderId) {
            console.error(`Webhook Error: No orderId found in Stripe session metadata for session ${session.id}. Cannot process.`);
            return new Response('Webhook Error: Missing orderId in metadata.', { status: 400 });
        }

        const orderRef = doc(db, 'orders', metadata.orderId);
        if (session.payment_status !== 'paid') return new Response('Payment pending', { status: 200 });
        const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        const fulfilled = await runTransaction(db, async transaction => {
          const orderSnap = await transaction.get(orderRef);
          if (!orderSnap.exists()) throw new Error('Order not found');
          const order = orderSnap.data();
          if (order.paymentStatus === 'Paid') return false;
          if (order.brandId !== metadata.brandId || order.locationId !== metadata.locationId || (order.psp?.checkoutSessionId && order.psp.checkoutSessionId !== session.id)) throw new Error('Payment scope mismatch');
          const customerRef = doc(db, 'customers', order.customerDetails.id);
          const customerSnap = await transaction.get(customerRef);
          if (customerSnap.exists() && customerSnap.data().brandId !== order.brandId) throw new Error('Customer scope mismatch');
          const discountId = order.appliedDiscountId;
          const discountRef = discountId ? doc(db, 'discounts', discountId) : null;
          const discountSnap = discountRef ? await transaction.get(discountRef) : null;
          if (discountSnap?.exists() && discountSnap.data().brandId !== order.brandId) throw new Error('Discount scope mismatch');
          const ledgerRef = doc(db, 'discount_reservations', order.brandId);
          const ledgerSnap = await transaction.get(ledgerRef);
          const ledger = ledgerSnap.data() || {};
          const holds = { ...(ledger.holds || {}) };
          const paid = { ...(ledger.paid || {}) };
          const customerPaid = { ...(ledger.customerPaid || {}) };
          const customerOrders = { ...(ledger.customerOrders || {}) };
          const customerId = order.customerDetails.id;
          delete holds[metadata.orderId];
          if (discountId) {
            paid[discountId] = Math.max(paid[discountId] || 0, discountSnap?.data()?.usedCount || 0) + 1;
            customerPaid[customerId] = { ...(customerPaid[customerId] || {}) };
            customerPaid[customerId][discountId] = Math.max(customerPaid[customerId][discountId] || 0, customerSnap.data()?.discountUsage?.[discountId] || 0) + 1;
          }
          customerOrders[customerId] = (customerOrders[customerId] || 0) + 1;
          transaction.set(ledgerRef, { holds, paid, customerPaid, customerOrders });
          const customer = customerSnap.data() || {};
          const usage = { ...(customer.discountUsage || {}) };
          if (discountRef && discountSnap?.exists()) {
            usage[discountId] = (usage[discountId] || 0) + 1;
            transaction.update(discountRef, { usedCount: (discountSnap.data().usedCount || 0) + 1 });
          }
          if (customerSnap.exists()) transaction.update(customerRef, {
            totalOrders: (customer.totalOrders || 0) + 1,
            totalSpend: (customer.totalSpend || 0) + order.totalAmount,
            lastOrderDate: serverTimestamp(),
            discountUsage: usage,
          });
          transaction.update(orderRef, {
            discountReservation: discountId ? 'consumed' : 'none',
            fulfillmentWarnings: [!customerSnap.exists() ? 'customer_deleted' : '', discountId && !discountSnap?.exists() ? 'discount_deleted' : ''].filter(Boolean),
            'psp.checkoutSessionId': session.id,
            paymentStatus: 'Paid', paidAt: serverTimestamp(),
            'psp.paymentIntentId': piId || null, updatedAt: serverTimestamp(),
          });
          return true;
        });
        if (fulfilled) {
          await trackServerEvent('payment_succeeded', {
            brandId: metadata.brandId, locationId: metadata.locationId,
            sessionId: metadata.anonymousConsentId || 'unknown-session',
            orderId: metadata.orderId, cartValue: (session.amount_total || 0) / 100,
            paymentIntentId: piId,
          });
        }

        console.log(`✅ Webhook idempotently confirmed order ${metadata.orderId} for session ${session.id}`);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error during order fulfillment';
        console.error(`Error fulfilling order for session ${session.id}: ${errorMessage}`);
        return new Response(`Webhook Handler Error: ${errorMessage}`, { status: 500 });
      }

      break;
    default:
      // console.log(`Unhandled event type ${event.type}`);
  }

  return new Response("ok", { status: 200 });
}
