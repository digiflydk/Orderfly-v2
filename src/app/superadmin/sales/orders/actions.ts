'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireOrderflyAccess } from '@/lib/access/orderfly-session';
import type { OrderStatus } from '@/types';
import { queueOrderFeedback } from '@/lib/feedback/mail-queue';

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
    try {
        if(!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)||!['Received','In Progress','Ready','Completed','Delivered','Canceled','Error'].includes(status))throw new Error('Invalid order or status.');
        const db=getAdminDb(),orderRef=db.collection('orders').doc(orderId),snapshot=await orderRef.get();
        if(!snapshot.exists)throw new Error('Order not found.');
        const scope=snapshot.data()!;
        await requireOrderflyAccess(scope.brandId,scope.locationId?[scope.locationId]:null,'orderfly.orders:edit');
        await db.runTransaction(async tx=>{
            const saved=await tx.get(orderRef),order=saved.data();
            if(!order||order.brandId!==scope.brandId||order.locationId!==scope.locationId)throw new Error('Order changed. Refresh and try again.');
            if(status==='Delivered'&&order.paymentStatus!=='Paid')throw new Error('Cannot mark order as Delivered until payment is confirmed.');
            tx.update(orderRef,{status});
        });
        if(status==='Completed'||status==='Delivered'){
            try { await queueOrderFeedback(orderId,true); } catch { /* Optional messaging never rolls back a saved status. */ }
        }
        revalidatePath('/superadmin/sales/orders');
        revalidatePath(`/superadmin/sales/orders/${orderId}`);
        revalidatePath('/superadmin/sales/dashboard');
        return {success:true,message:`Order status updated to ${status}.`};
    } catch(error) {
        const message=error instanceof Error?error.message:'An unknown error occurred';
        return {success:false,message:`Failed to update status: ${message}`};
    }
}
