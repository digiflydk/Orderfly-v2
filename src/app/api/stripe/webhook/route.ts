
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
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      
      try {
        const metadata = session.metadata;
        if (!metadata || !metadata.orderId) {
            console.error(`Webhook Error: No orderId found in Stripe session metadata for session ${session.id}. Cannot process.`);
            return new Response('Webhook Error: Missing orderId in metadata.', { status: 400 });
        }

        const orderRef = doc(db, 'orders', metadata.orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) {
          console.error(`Webhook critical error: Order document with ID ${metadata.orderId} not found. The pre-creation step might have failed. Session ID: ${session.id}`);
          return new Response('Order not found, webhook will not create a duplicate.', { status: 200 });
        }
        
        // Idempotency check: If order is already marked as 'Paid', do nothing more.
        if (orderSnap.data().paymentStatus === 'Paid') {
            console.log(`✅ Webhook received for already processed order ${metadata.orderId}. No action taken.`);
            return new Response("ok", { status: 200 });
        }

        const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        
        await updateDoc(orderRef, {
            paymentStatus: 'Paid',
            paidAt: serverTimestamp(),
            'psp.paymentIntentId': piId,
            updatedAt: serverTimestamp()
        });
        
        // Track payment_succeeded event
        await trackServerEvent('payment_succeeded', {
            brandId: metadata.brandId,
            locationId: metadata.locationId,
            sessionId: metadata.anonymousConsentId || 'unknown-session',
            orderId: metadata.orderId,
            cartValue: session.amount_total ? session.amount_total / 100 : 0,
            paymentIntentId: piId, // Add for idempotency on analytics side if needed
        });
        
        // Update customer aggregates.
        if (session.customer_details?.email) {
            const customerRef = doc(db, "customers", orderSnap.data().customerDetails.id);
            const customerDoc = await getDoc(customerRef);
            if (customerDoc.exists()) {
                const customerData = customerDoc.data();
                const newTotalOrders = (customerData.totalOrders || 0) + 1;
                const newTotalSpend = (customerData.totalSpend || 0) + orderSnap.data().totalAmount;
                await updateDoc(customerRef, {
                    totalOrders: newTotalOrders,
                    totalSpend: newTotalSpend,
                    lastOrderDate: serverTimestamp()
                });
            }
        }
        
        if (metadata.appliedDiscountId) {
            const discountRef = doc(db, 'discounts', metadata.appliedDiscountId);
             await runTransaction(db, async (transaction) => {
                const freshSnap = await transaction.get(discountRef);
                if (!freshSnap.exists()) { throw "Discount does not exist!"; }
                const currentUsedCount = (freshSnap.data()?.usedCount || 0) + 1;
                transaction.update(discountRef, { usedCount: currentUsedCount });
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
