import 'server-only';
import { z } from 'zod';
import { readReceiptDeliveryTracking } from '@/lib/delivery/tracking-server';
import type { CustomerDeliveryTracking } from '@/lib/delivery/tracking';
import Stripe from 'stripe';
import {resolveManagedStripeGateway,managedStripeAccountSchema} from '@/lib/delivery/payments/stripe-authority';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getOrderById, getOrderByCheckoutSessionId } from '@/app/checkout/order-actions';
import { getActiveStripeSecretKey } from '@/lib/server/payment-settings';
import { settlePaidCheckoutSession } from './settle-checkout';
import type { OrderDetail } from '@/types';

export type ReceiptProof = { sessionId?: string; receiptToken?: string; orderId?: string; brandId?: string; locationId?: string };
export type GuestReceipt = Pick<OrderDetail,
  'id' | 'brandId' | 'locationId' | 'customerName' | 'customerContact' | 'deliveryType' |
  'deliveryTime' | 'status' | 'paymentStatus' | 'paymentMethod' | 'totalAmount' | 'productItems'> & {
  managedDeliveryTracking?: CustomerDeliveryTracking;
  expectedDeliveryAt?: string;
  createdAt: string;
  customerDetails: Pick<OrderDetail['customerDetails'], 'id' | 'address'>;
  paymentDetails: Omit<OrderDetail['paymentDetails'], 'paymentRefId'>;
  invoice?: OrderDetail['invoice'];
  paymentCollection?: Pick<NonNullable<OrderDetail['paymentCollection']>, 'method'>;
};

function receiptExpectedDeliveryAt(value: unknown): string | undefined {
  try {
    const date = value instanceof Date ? value : typeof value === 'string' && z.string().datetime({offset:true}).safeParse(value).success
      ? new Date(value) : value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : null;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  } catch { return undefined; }
}

// The existing random Stripe session ID is a guest capability, not a user ID.
// Never recover or disclose it from a predictable order ID. Keep it out of logs.
export async function readGuestReceipt(proof: ReceiptProof, options: { reconcilePayment?: boolean } = {}): Promise<GuestReceipt | null> {
  const validSession = /^cs_(test_|live_)?[A-Za-z0-9_]{8,250}$/.test(proof.sessionId || '');
  if (!validSession && (proof.sessionId || !proof.orderId)) return null;
  let order = proof.orderId ? await getOrderById(proof.orderId) : await getOrderByCheckoutSessionId(proof.sessionId!);
  if (!order ||
      (proof.brandId && order.brandId !== proof.brandId) ||
      (proof.locationId && order.locationId !== proof.locationId)) return null;
  const pickup = order.paymentMethod === 'PayAtPickup';
  if (pickup ? !!proof.sessionId || order.deliveryType !== 'Pickup' || !!order.psp : !validSession || order.psp?.checkoutSessionId !== proof.sessionId) return null;

  const tokenHash = (order as OrderDetail & { receiptTokenHash?: string }).receiptTokenHash;
  if (pickup && !tokenHash) return null;
  // New receipts use a dedicated capability stored only as a hash. Previously
  // issued Stripe URLs retain their session-bound proof during the migration.
  if (tokenHash) {
    if (!/^[a-f0-9]{64}$/.test(tokenHash) || !/^[a-f0-9]{64}$/.test(proof.receiptToken || '')) return null;
    if (!timingSafeEqual(Buffer.from(tokenHash, 'hex'), createHash('sha256').update(proof.receiptToken!).digest())) return null;
  }

  // A delayed webhook must not produce either a false receipt or a second order.
  // A failed read stays Pending and can be retried; it is not payment failure.
  if (options.reconcilePayment !== false && !pickup && proof.sessionId && (order.paymentStatus === 'Pending' || order.paymentStatus === 'Paid')) {
    try {
      // getOrderById/getOrderByCheckoutSessionId are private native server reads.
      // Keep payment authority fields local; the public receipt projection below never includes them.
      const nativePayment=order as OrderDetail&{managedDelivery?:unknown;managedStripeAccount?:unknown};
      const key = nativePayment.managedDelivery?null:await getActiveStripeSecretKey();
      if (nativePayment.managedDelivery||key) {
        const expected=nativePayment.managedDelivery?managedStripeAccountSchema.parse(nativePayment.managedStripeAccount):null;
        const gateway=expected?await resolveManagedStripeGateway(expected.livemode?'production':'sandbox'):null;
        if(expected&&gateway?.binding.accountId!==expected.accountId)throw Error('delivery_payment_account_changed');
        const stripe = gateway?.stripe??new Stripe(key!, { timeout: 5000, maxNetworkRetries: 0 });
        const session = await stripe.checkout.sessions.retrieve(proof.sessionId);
        if (session.id !== proof.sessionId || session.metadata?.orderId !== order.id ||
            session.metadata?.brandId !== order.brandId || session.metadata?.locationId !== order.locationId) return null;
        if (session.payment_status === 'paid') {
          await settlePaidCheckoutSession(session);
          order = await getOrderById(order.id);
          if (!order) return null;
        } else if (order.paymentStatus === 'Pending' && session.status === 'expired') {
          // Display-only terminal status. Reservation release remains in the
          // signed expiration/cancellation workflow, never inferred from a timeout.
          order = { ...order, paymentStatus: 'Failed' };
        }
      }
    } catch { /* Preserve authoritative Pending state on a temporary outage. */ }
  }

  if (!order) return null;
  const managedDeliveryTracking = await readReceiptDeliveryTracking(order).catch(() => null);
  const payment = order.paymentDetails;
  const expectedDeliveryAt = managedDeliveryTracking ? receiptExpectedDeliveryAt((order as OrderDetail & {expectedDeliveryAt?: unknown}).expectedDeliveryAt) : undefined;
  // Explicit projection: no PSP identifiers, cancel hashes or arbitrary DB fields.
  return {
    ...(managedDeliveryTracking ? {managedDeliveryTracking} : {}),
    ...(expectedDeliveryAt ? {expectedDeliveryAt} : {}),
    id: order.id, brandId: order.brandId, locationId: order.locationId,
    customerName: order.customerName, customerContact: order.customerContact,
    customerDetails: { id: order.customerDetails.id, address: order.customerDetails.address },
    deliveryType: order.deliveryType, deliveryTime: order.deliveryTime,
    status: order.status, paymentStatus: order.paymentStatus, paymentMethod: order.paymentMethod, totalAmount: order.totalAmount,
    ...(order.paymentCollection ? { paymentCollection: { method: order.paymentCollection.method } } : {}),
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : new Date(order.createdAt).toISOString(),
    productItems: order.productItems.map(item => ({
      id: item.id, name: item.name, quantity: item.quantity, unitPrice: item.unitPrice,
      totalPrice: item.totalPrice, toppings: item.toppings,
      comboSelections: item.comboSelections?.map(group => ({
        groupId: group.groupId, groupName: group.groupName,
        products: group.products.map(product => ({ id: product.id, name: product.name })),
      })),
    })),
    paymentDetails: {
      subtotal: payment.subtotal, taxes: payment.taxes, deliveryFee: payment.deliveryFee,
      bagFee: payment.bagFee, adminFee: payment.adminFee, vatAmount: payment.vatAmount,
      discountTotal: payment.discountTotal, itemDiscountTotal: payment.itemDiscountTotal,
      cartDiscountTotal: payment.cartDiscountTotal, cartDiscountName: payment.cartDiscountName,
      tips: payment.tips,
    },
    ...(order.invoice ? { invoice: order.invoice } : {}),
  };
}
