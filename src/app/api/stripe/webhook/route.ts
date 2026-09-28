import { settlePaidCheckoutSession } from '@/lib/server/settle-checkout';
import { releaseDiscount } from '@/lib/discount-reservations';

import Stripe from 'stripe';
import { getActiveStripeSecretKey, getActiveStripeWebhookSecret } from '@/lib/server/payment-settings';
import { headers } from 'next/headers';


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
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const failed = event.data.object as Stripe.Checkout.Session;
      if (failed.payment_status === 'paid') break;
      if (failed.metadata?.orderId && failed.metadata?.brandId && failed.metadata?.locationId) {
        try { await releaseDiscount(failed.metadata.orderId, failed.metadata.brandId, failed.id, failed.metadata.locationId); }
        catch { return new Response('Reservation release failed', { status: 500 }); }
      }
      break;
    }
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      
      try {
        const metadata = session.metadata;
        if (!metadata || !metadata.orderId) {
            console.error('checkout_webhook_missing_order');
            return new Response('Webhook Error: Missing orderId in metadata.', { status: 400 });
        }

        await settlePaidCheckoutSession(session);

        console.info('checkout_webhook_processed', { orderId: metadata.orderId, paymentStatus: session.payment_status });

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error during order fulfillment';
        console.error('checkout_settlement_failed', { orderId: session.metadata?.orderId });
        return new Response('Webhook settlement failed', { status: 500 });
      }

      break;
    default:
      // console.log(`Unhandled event type ${event.type}`);
  }

  return new Response("ok", { status: 200 });
}
