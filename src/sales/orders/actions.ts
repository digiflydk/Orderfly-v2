

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import type { OrderStatus } from '@/types';

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
    try {
        const orderRef = doc(db, 'orders', orderId);
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
