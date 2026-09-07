'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFinancialAdmin } from '@/lib/loyalty/admin-session';
import type { OrderStatus } from '@/types';

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
    try {
        const actor = await requireFinancialAdmin();
        if (!['Received', 'In Progress', 'Ready', 'Completed', 'Delivered', 'Canceled', 'Error'].includes(status)) throw new Error('Invalid order status.');
        const db = getAdminDb(), orderRef = db.collection('orders').doc(orderId);
        // Read payment/refund state and write status together. A concurrent payment
        // must not turn a pending cancellation into cancellation of an unrefunded sale.
        await db.runTransaction(async tx => {
            const snap = await tx.get(orderRef);
            if (!snap.exists) throw new Error('Order not found.');
            const order = snap.data()!;
            if (status === 'Canceled' && order.paymentStatus === 'Paid' && (order.refundedAmountOre || 0) < Math.round(order.totalAmount * 100)) {
                throw new Error('Refundér betalingen i Stripe før den betalte ordre annulleres. Loyalty korrigeres ved refunderingen.');
            }
            if (status === 'Delivered' && order.paymentStatus !== 'Paid') throw new Error('Cannot mark order as Delivered until payment is confirmed.');
            tx.update(orderRef, { status });
            tx.create(db.collection('loyalty_audit').doc(), { kind: 'order_status_updated', actor: actor.uid, orderId, brandId: order.brandId, status, at: new Date().toISOString() });
        });
        revalidatePath('/superadmin/sales/orders');
        revalidatePath(`/superadmin/sales/orders/${orderId}`);
        revalidatePath('/superadmin/sales/dashboard');
        return { success: true, message: `Order status updated to ${status}.` };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred';
        console.error('Failed to update order status:', message);
        return { success: false, message: `Failed to update status: ${message}` };
    }
}
