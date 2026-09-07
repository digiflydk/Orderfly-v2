import { fulfillPaidSession } from '@/lib/payments/settlement';
import { processRefund } from '@/lib/payments/refunds';
import { releaseDiscount, prepareCapacitySettlement } from '@/lib/discount-reservations';

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
    case 'charge.refunded': {
      try { await processRefund(event.data.object as Stripe.Charge); }
      catch { return new Response('Refund processing failed',{status:500}); }
      break;
    }
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      
      try {
        const fulfilled = await fulfillPaidSession(session);
        const metadata = session.metadata!;
        const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
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
