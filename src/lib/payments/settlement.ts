import 'server-only';
import type Stripe from 'stripe';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { prepareCapacitySettlement } from '@/lib/discount-reservations';
import { settleRewards } from '@/lib/loyalty/rewards';

// Call only after Stripe signature verification or server-side retrieval.
export async function fulfillPaidSession(session:Stripe.Checkout.Session) {
        const metadata = session.metadata;
        if (!metadata || !metadata.orderId) {
            console.error(`Webhook Error: No orderId found in Stripe session metadata for session ${session.id}. Cannot process.`);
            throw new Error('Missing payment metadata');
        }

        const orderRef = getAdminDb().collection('orders').doc(metadata.orderId);
        if (session.payment_status !== 'paid' && !(session.payment_status === 'no_payment_required' && session.status === 'complete' && session.amount_total === 0)) return false;
        const piId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        const fulfilled = await getAdminDb().runTransaction( async transaction => {
          const orderSnap = await transaction.get(orderRef);
          if (!orderSnap.exists) throw new Error('Order not found');
          const order = orderSnap.data()!;
          if (session.currency !== 'dkk' || session.amount_total !== Math.round(order.totalAmount*100)) throw new Error('Payment amount mismatch');
          if (order.brandId !== metadata.brandId || order.locationId !== metadata.locationId || (order.psp?.checkoutSessionId && order.psp.checkoutSessionId !== session.id)) throw new Error('Payment scope mismatch');
          if (order.paymentStatus === 'Paid') return false;
          const customerRef = getAdminDb().collection('customers').doc(order.customerDetails.id);
          const customerSnap = await transaction.get(customerRef);
          if (customerSnap.exists && customerSnap.data()!.brandId !== order.brandId) throw new Error('Customer scope mismatch');
          const discountId = order.appliedDiscountId;
          const discountRef = discountId ? getAdminDb().collection('discounts').doc(discountId) : null;
          const discountSnap = discountRef ? await transaction.get(discountRef) : null;
          if (discountSnap?.exists && discountSnap.data()!.brandId !== order.brandId) throw new Error('Discount scope mismatch');
          const settleCapacity = await prepareCapacitySettlement(transaction, order, true);
          settleCapacity();
          const customer = customerSnap.data()! || {};
          const usage = { ...(customer.discountUsage || {}) };
          if (discountRef && discountSnap?.exists) {
            usage[discountId] = (usage[discountId] || 0) + 1;
            transaction.update(discountRef, { usedCount: (discountSnap.data()!.usedCount || 0) + 1 });
          }
          if (customerSnap.exists) transaction.update(customerRef, {
            totalOrders: (customer.totalOrders || 0) + ((order.refundedAmountOre||0) >= Math.round(order.totalAmount*100) ? 0 : 1),
            totalSpend: (customer.totalSpend || 0) + Math.max(0,order.totalAmount-(order.refundedAmountOre||0)/100),
            lastOrderDate: new Date(Math.max(customer.lastOrderDate?.toDate?.()?.getTime()||0,session.created*1000)),
            discountUsage: usage,
          });
          transaction.update(orderRef, {
            discountReservation: discountId ? 'consumed' : 'none',
            fulfillmentWarnings: [!customerSnap.exists ? 'customer_deleted' : '', discountId && !discountSnap?.exists ? 'discount_deleted' : ''].filter(Boolean),
            'psp.checkoutSessionId': session.id,
            paymentStatus: 'Paid', paidAt: new Date(session.created*1000),
            'psp.paymentIntentId': piId || null, updatedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });

        await settleRewards(metadata.orderId,metadata.brandId!,true,session.amount_total!);
        return fulfilled;
}
