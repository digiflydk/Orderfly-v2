import 'server-only';
import Stripe from 'stripe';
import { z } from 'zod';
import { getActiveStripeSecretKey } from '@/lib/server/payment-settings';

export const managedStripeAccountSchema = z.object({ accountId: z.string().regex(/^acct_[A-Za-z0-9]+$/), livemode: z.boolean() }).strict();
export type ManagedStripeAccount = z.infer<typeof managedStripeAccountSchema>;
/** The exact returned client must create the managed checkout session bound to this account. */
export async function resolveManagedStripeGateway() {
  const secret = await getActiveStripeSecretKey();
  const match = secret && /^(?:sk|rk)_(test|live)_/.exec(secret);
  if (!secret || !match) throw new Error('delivery_payment_unavailable');
  const stripe = new Stripe(secret, { timeout: 15000, maxNetworkRetries: 0 });
  const account = await stripe.accounts.retrieve();
  return { stripe, binding: managedStripeAccountSchema.parse({ accountId: account.id, livemode: match[1] === 'live' }) };
}
export type VerifiedManagedPayment = Readonly<{ readonly verifiedManagedPayment: unique symbol }>;
type PaymentProjection = {
  binding: ManagedStripeAccount; paymentIntentId: string; checkoutSessionId: string; chargeId: string;
  amountMinor: number; refundedAmountMinor: number; scope: {brandId:string;locationId:string;orderId:string};
};
const proofs = new WeakMap<object, { stripe: Stripe; value: PaymentProjection; verifiedAt: number }>();
const reference = (value: string | { id: string } | null) => typeof value === 'string' ? value : value?.id;
export async function verifyManagedPaidOrder(orderId: string, order: Record<string, any>): Promise<VerifiedManagedPayment> {
  const expected = managedStripeAccountSchema.parse(order.managedStripeAccount);
  if (!['Pending', 'Paid'].includes(order.paymentStatus) || order.deliveryType !== 'Delivery' || order.psp?.provider !== 'stripe'
    || !/^pi_[A-Za-z0-9]+$/.test(order.psp.paymentIntentId) || !/^cs_[A-Za-z0-9_]+$/.test(order.psp.checkoutSessionId)
    || typeof order.totalAmount !== 'number' || !Number.isFinite(order.totalAmount)) throw new Error('delivery_payment_invalid');
  const { stripe, binding } = await resolveManagedStripeGateway();
  if (binding.accountId !== expected.accountId || binding.livemode !== expected.livemode) throw new Error('delivery_payment_account_changed');
  const session = await stripe.checkout.sessions.retrieve(order.psp.checkoutSessionId);
  const pi = await stripe.paymentIntents.retrieve(order.psp.paymentIntentId, { expand: ['latest_charge'] });
  const charge = pi.latest_charge;
  const amountMinor = Math.round(order.totalAmount * 100);
  const scope = { brandId: order.brandId, locationId: order.locationId, orderId };
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || session.id !== order.psp.checkoutSessionId || session.payment_status !== 'paid' || session.mode !== 'payment' || session.status !== 'complete'
    || reference(session.payment_intent) !== pi.id || pi.id !== order.psp.paymentIntentId || pi.status !== 'succeeded'
    || session.livemode !== binding.livemode || pi.livemode !== binding.livemode || session.currency !== 'dkk' || pi.currency !== 'dkk'
    || session.amount_total !== amountMinor || pi.amount_received !== amountMinor || pi.amount !== amountMinor
    || !charge || typeof charge === 'string' || !charge.paid || charge.disputed || charge.currency !== 'dkk' || charge.amount !== amountMinor
    || reference(charge.payment_intent) !== pi.id || charge.livemode !== binding.livemode
    || !Number.isSafeInteger(charge.amount_refunded) || charge.amount_refunded < 0 || charge.amount_refunded > amountMinor
    || Object.entries(scope).some(([key, value]) => !value || session.metadata?.[key] !== value || pi.metadata[key] !== value)) throw new Error('delivery_payment_mismatch');
  const proof = Object.freeze({}) as VerifiedManagedPayment;
  proofs.set(proof, { stripe, value: { binding, scope, paymentIntentId: pi.id, checkoutSessionId: session.id, chargeId: charge.id, amountMinor, refundedAmountMinor: charge.amount_refunded }, verifiedAt: Date.now() });
  return proof;
}
export function managedPaymentProjection(proof: VerifiedManagedPayment): PaymentProjection {
  const entry = proofs.get(proof);
  if (!entry || Date.now() < entry.verifiedAt || Date.now() - entry.verifiedAt > 60000) throw new Error('delivery_payment_proof_expired');
  return structuredClone(entry.value);
}
export async function submitManagedRefund(proof: VerifiedManagedPayment, key: string): Promise<Stripe.Refund> {
  const value = managedPaymentProjection(proof);
  if (!/^[a-f0-9]{64}$/.test(key) || value.refundedAmountMinor !== 0) throw new Error('delivery_refund_ineligible');
  return proofs.get(proof)!.stripe.refunds.create({ payment_intent: value.paymentIntentId, amount: value.amountMinor,
    metadata: { orderflyDeliveryRefund: key, orderId: value.scope.orderId, brandId: value.scope.brandId, locationId: value.scope.locationId } }, { idempotencyKey: `delivery-refund-${key}` });
}
export async function reconcileManagedRefund(proof: VerifiedManagedPayment, key: string): Promise<Stripe.Refund | null> {
  const value = managedPaymentProjection(proof), stripe = proofs.get(proof)!.stripe;
  let starting_after: string | undefined; const found: Stripe.Refund[] = [];
  for (let page = 0; page < 10; page++) {
    const response = await stripe.refunds.list({ payment_intent: value.paymentIntentId, limit: 100, ...(starting_after ? { starting_after } : {}) });
    found.push(...response.data.filter(refund => refund.metadata?.orderflyDeliveryRefund === key));
    if (found.length > 1) throw new Error('delivery_refund_duplicate');
    if (!response.has_more) return found[0] ?? null;
    if (!response.data.length) throw new Error('delivery_refund_incomplete');
    starting_after = response.data[response.data.length - 1].id;
  }
  throw new Error('delivery_refund_incomplete');
}
export function assertManagedRefund(proof: VerifiedManagedPayment, key: string, refund: Stripe.Refund) {
  const value = managedPaymentProjection(proof);
  if (!refund || !/^re_[A-Za-z0-9]+$/.test(refund.id) || reference(refund.payment_intent) !== value.paymentIntentId
    || reference(refund.charge) !== value.chargeId || refund.amount !== value.amountMinor || refund.currency !== 'dkk'
    || refund.metadata?.orderflyDeliveryRefund !== key || Object.entries(value.scope).some(([k,v]) => refund.metadata?.[k] !== v)) throw new Error('delivery_refund_mismatch');
  return { id: refund.id, status: refund.status === 'succeeded' ? 'succeeded' as const : refund.status === 'failed' || refund.status === 'canceled' ? 'failed' as const : 'pending' as const };
}
