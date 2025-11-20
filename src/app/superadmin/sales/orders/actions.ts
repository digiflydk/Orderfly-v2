
'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import type { OrderDetail, OrderStatus } from '@/types';

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
    try {
        const db = getAdminDb();
        const orderRef = doc(db, 'orders', orderId);
        
        if (status === 'Delivered') {
            const orderSnap = await getDoc(orderRef);
            if (!orderSnap.exists()) {
                return { success: false, message: 'Order not found.' };
            }
            const orderData = orderSnap.data() as OrderDetail;
            if (orderData.paymentStatus !== 'Paid') {
                return { success: false, message: 'Cannot mark order as Delivered until payment is confirmed.' };
            }
        }
        
        await updateDoc(orderRef, { status: status });
        
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
