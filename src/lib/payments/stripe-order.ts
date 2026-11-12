import 'server-only';
import Stripe from 'stripe';
import { getActiveStripeSecretKey } from '@/lib/server/payment-settings';
import { readPinnedStripeAgreement } from './merchant-agreement';

/** Historic orders retain legacy resolution. Explicit bindings never fall back. */
export async function stripeForOrder(order: {brandId?:unknown;locationId?:unknown;psp?:any;paymentAgreement?:unknown}, timeout = 5000) {
  if (order.psp?.provider && order.psp.provider !== 'stripe') throw new Error('Forkert betalingsudbyder.');
  if (!order.paymentAgreement) {
    const key = await getActiveStripeSecretKey();
    if (!key) throw new Error('Stripe er ikke konfigureret.');
    return new Stripe(key,{timeout,maxNetworkRetries:0});
  }
  const {binding,credentials} = await readPinnedStripeAgreement(order.paymentAgreement);
  if (binding.owner.brandId !== order.brandId || binding.owner.locationId && binding.owner.locationId !== order.locationId) throw new Error('Betalingsaftalens scope stemmer ikke.');
  return new Stripe(credentials.secretKey,{timeout,maxNetworkRetries:0});
}
export async function verifyPinnedStripeWebhook(rawBody:string,signature:string){
  // Untrusted content selects one bounded candidate only. No event is consumed before signature verification.
  const candidate=JSON.parse(rawBody)?.data?.object;
  const orderId=candidate?.metadata?.orderId;
  if(typeof orderId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(orderId))throw Error('Invalid webhook');
  const {getAdminDb}=await import('@/lib/firebase-admin');
  const order=(await getAdminDb().collection('orders').doc(orderId).get()).data();
  if(!order?.paymentAgreement||order.psp?.provider!=='stripe')throw Error('Invalid webhook');
  const {credentials}=await readPinnedStripeAgreement(order.paymentAgreement);
  const stripe=await stripeForOrder(order);
  const event=await stripe.webhooks.constructEventAsync(rawBody,signature,credentials.webhookSecret);
  const session=event.data.object as Stripe.Checkout.Session;
  if(session.metadata?.orderId!==orderId||session.metadata?.brandId!==order.brandId||session.metadata?.locationId!==order.locationId||session.id!==order.psp.checkoutSessionId)throw Error('Invalid webhook scope');
  return event;
}
