import 'server-only';
import Stripe from 'stripe';
import { getActiveStripeSecretKey } from '@/lib/server/payment-settings';
import { readPinnedStripeAgreement, stripeBindingSchema } from './merchant-agreement';
import { isCompletedFreeCardSession, isZeroTotalDiscountCardOrder } from '@/lib/loyalty/discount-card/zero-total';

type StripeOrder = { brandId?: unknown; locationId?: unknown; psp?: any; paymentAgreement?: unknown; totalAmount?: unknown; paymentMethod?: unknown };

/** Historic orders retain legacy resolution. Explicit bindings never fall back. */
export async function stripeForOrder(order: StripeOrder, timeout = 5000) {
  if (order.psp?.provider && order.psp.provider !== 'stripe') throw new Error('Forkert betalingsudbyder.');
  if (order.paymentAgreement === undefined) {
    const key = await getActiveStripeSecretKey();
    if (!key) throw new Error('Stripe er ikke konfigureret.');
    return new Stripe(key, { timeout, maxNetworkRetries: 0 });
  }
  const binding = stripeBindingSchema.parse(order.paymentAgreement);
  if (binding.owner.brandId !== order.brandId || binding.owner.locationId && binding.owner.locationId !== order.locationId) throw new Error('Betalingsaftalens scope stemmer ikke.');
  const { credentials } = await readPinnedStripeAgreement(binding);
  return new Stripe(credentials.secretKey, { timeout, maxNetworkRetries: 0 });
}

/** Server observations must match the immutable order before any settlement/release. */
export function assertStripeOrderSession(orderId: string, order: StripeOrder, session: Stripe.Checkout.Session) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(orderId) || order.psp?.provider && order.psp.provider !== 'stripe'
    || order.paymentMethod === 'PayAtPickup' || order.paymentMethod === 'Worldline'
    || session.mode !== 'payment' || session.id !== order.psp?.checkoutSessionId
    || session.metadata?.orderId !== orderId || session.metadata?.brandId !== order.brandId || session.metadata?.locationId !== order.locationId
    || session.currency?.toLowerCase() !== 'dkk' || typeof order.totalAmount !== 'number' || !Number.isFinite(order.totalAmount)
    || session.amount_total !== Math.round(order.totalAmount * 100)) throw new Error('Stripe payment scope mismatch');
  if (order.paymentAgreement !== undefined) {
    const binding = stripeBindingSchema.parse(order.paymentAgreement);
    if (binding.owner.brandId !== order.brandId || binding.owner.locationId && binding.owner.locationId !== order.locationId
      || session.livemode !== (binding.mode === 'live')) throw new Error('Stripe payment environment mismatch');
  }
  if (session.payment_status === 'no_payment_required' && (!isCompletedFreeCardSession(session) || !isZeroTotalDiscountCardOrder(order))) throw new Error('Stripe free-order mismatch');
  return session;
}

export async function verifyPinnedStripeWebhook(rawBody: string, signature: string) {
  // Untrusted content selects one bounded candidate only. No event is consumed before signature verification.
  if (Buffer.byteLength(rawBody) > 262144 || signature.length > 4096) throw new Error('Invalid webhook');
  const candidate = JSON.parse(rawBody)?.data?.object;
  const orderId = candidate?.metadata?.orderId;
  if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) throw new Error('Invalid webhook');
  const { getAdminDb } = await import('@/lib/firebase-admin');
  const order = (await getAdminDb().collection('orders').doc(orderId).get()).data();
  if (!order?.paymentAgreement || order.psp?.provider !== 'stripe') throw new Error('Invalid webhook');
  const binding = stripeBindingSchema.parse(order.paymentAgreement);
  if (binding.owner.brandId !== order.brandId || binding.owner.locationId && binding.owner.locationId !== order.locationId) throw new Error('Invalid webhook scope');
  const { credentials } = await readPinnedStripeAgreement(binding);
  if (!credentials.webhookSecret) throw new Error('Stripe webhook is not configured');
  const stripe = new Stripe(credentials.secretKey, { timeout: 5000, maxNetworkRetries: 0 });
  const event = await stripe.webhooks.constructEventAsync(rawBody, signature, credentials.webhookSecret);
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'checkout.session.async_payment_failed'].includes(event.type)
    || event.livemode !== (binding.mode === 'live')) throw new Error('Invalid webhook event');
  const session = event.data.object as Stripe.Checkout.Session;
  assertStripeOrderSession(orderId, order, session);
  return event;
}
