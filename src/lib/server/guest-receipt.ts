import 'server-only';
import Stripe from 'stripe';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getOrderById, getOrderByCheckoutSessionId } from '@/app/checkout/order-actions';
import { getActiveStripeSecretKey } from '@/app/superadmin/settings/actions';
import { settlePaidCheckoutSession } from './settle-checkout';
import type { OrderDetail } from '@/types';

export type ReceiptProof = { sessionId: string; receiptToken?: string; orderId?: string; brandId?: string; locationId?: string };
export type GuestReceipt = Pick<OrderDetail,
  'id' | 'brandId' | 'locationId' | 'customerName' | 'customerContact' | 'deliveryType' |
  'deliveryTime' | 'status' | 'paymentStatus' | 'totalAmount' | 'productItems'> & {
  createdAt: string;
  customerDetails: Pick<OrderDetail['customerDetails'], 'id' | 'address'>;
  paymentDetails: Omit<OrderDetail['paymentDetails'], 'paymentRefId'>;
};

// The existing random Stripe session ID is a guest capability, not a user ID.
// Never recover or disclose it from a predictable order ID. Keep it out of logs.
export async function readGuestReceipt(proof: ReceiptProof): Promise<GuestReceipt | null> {
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]{8,250}$/.test(proof.sessionId || '')) return null;
  let order = proof.orderId ? await getOrderById(proof.orderId) : await getOrderByCheckoutSessionId(proof.sessionId);
  if (!order || order.psp?.checkoutSessionId !== proof.sessionId ||
      (proof.brandId && order.brandId !== proof.brandId) ||
      (proof.locationId && order.locationId !== proof.locationId)) return null;

  const tokenHash = (order as OrderDetail & { receiptTokenHash?: string }).receiptTokenHash;
  // New receipts use a dedicated capability stored only as a hash. Previously
  // issued Stripe URLs retain their session-bound proof during the migration.
  if (tokenHash) {
    if (!/^[a-f0-9]{64}$/.test(tokenHash) || !/^[a-f0-9]{64}$/.test(proof.receiptToken || '')) return null;
    if (!timingSafeEqual(Buffer.from(tokenHash, 'hex'), createHash('sha256').update(proof.receiptToken!).digest())) return null;
  }

  // A delayed webhook must not produce either a false receipt or a second order.
  // A failed read stays Pending and can be retried; it is not payment failure.
  if (order.paymentStatus === 'Pending') {
    try {
      const key = await getActiveStripeSecretKey();
      if (key) {
        const stripe = new Stripe(key, { timeout: 5000, maxNetworkRetries: 0 });
        const session = await stripe.checkout.sessions.retrieve(proof.sessionId);
        if (session.id !== proof.sessionId || session.metadata?.orderId !== order.id ||
            session.metadata?.brandId !== order.brandId || session.metadata?.locationId !== order.locationId) return null;
        if (session.payment_status === 'paid') {
          await settlePaidCheckoutSession(session);
          order = await getOrderById(order.id);
          if (!order) return null;
        } else if (session.status === 'expired') {
          // Display-only terminal status. Reservation release remains in the
          // signed expiration/cancellation workflow, never inferred from a timeout.
          order = { ...order, paymentStatus: 'Failed' };
        }
      }
    } catch { /* Preserve authoritative Pending state on a temporary outage. */ }
  }

  if (!order) return null;
  const payment = order.paymentDetails;
  // Explicit projection: no PSP identifiers, cancel hashes or arbitrary DB fields.
  return {
    id: order.id, brandId: order.brandId, locationId: order.locationId,
    customerName: order.customerName, customerContact: order.customerContact,
    customerDetails: { id: order.customerDetails.id, address: order.customerDetails.address },
    deliveryType: order.deliveryType, deliveryTime: order.deliveryTime,
    status: order.status, paymentStatus: order.paymentStatus, totalAmount: order.totalAmount,
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
  };
}
