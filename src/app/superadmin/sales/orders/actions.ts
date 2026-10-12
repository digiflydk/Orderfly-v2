'use server';

import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { requireOrderflyAccess } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import type { OrderStatus } from '@/types';
import { queueOrderFeedback } from '@/lib/feedback/mail-queue';

export async function updateOrderStatus(orderId: string, status: OrderStatus, cancellationComment?: string) {
    try {
        if(!/^[A-Za-z0-9_-]{1,128}$/.test(orderId)||!['Received','In Progress','Ready','Completed','Delivered','Canceled','Error'].includes(status))throw new Error('Invalid order or status.');
        const comment = typeof cancellationComment === 'string' ? cancellationComment.trim() : '';
        if(status === 'Canceled' && (comment.length < 3 || comment.length > 500))throw new Error('Add a cancellation comment of 3–500 characters.');
        const db=getAdminDb(),orderRef=db.collection('orders').doc(orderId),snapshot=await orderRef.get();
        if(!snapshot.exists)throw new Error('Order not found.');
        const scope=snapshot.data()!;
        const access = await requireOrderflyAccess(scope.brandId,scope.locationId?[scope.locationId]:null,'orderfly.orders:edit');
        await db.runTransaction(async tx=>{
            const saved=await tx.get(orderRef),order=saved.data();
            if(!order||order.brandId!==scope.brandId||order.locationId!==scope.locationId)throw new Error('Order changed. Refresh and try again.');
            await authorizeTransaction(tx,access.identity,order,'orderfly.orders:edit','location');
            if(order.status === 'Canceled')throw new Error('A canceled order cannot be changed again.');
            // An operator status change cannot stand in for Stripe expiration.
            // The customer cancel path and signed webhooks close unpaid sessions.
            const pickupPending = order.paymentMethod === 'PayAtPickup' && order.deliveryType === 'Pickup' && !order.psp && order.paymentStatus === 'Pending' && order.discountReservation === 'held' && !['Pending', 'Canceled'].includes(order.status);
            if(order.paymentStatus!=='Paid' && !(pickupPending && ['Received', 'In Progress', 'Ready', 'Error'].includes(status)))throw new Error('Wait for verified payment or Stripe cancellation before changing this order.');
            const now = getAdminFieldValue().serverTimestamp();
            if(status === 'Canceled') {
                tx.update(orderRef,{status, cancellationComment:comment, canceledAt:now, canceledBy:access.identity.subject, updatedAt:now});
                tx.create(db.collection('auditLogs').doc(createHash('sha256').update(JSON.stringify(['order-cancel',order.brandId,orderId])).digest('hex')),{action:'order_canceled',orderId,brandId:order.brandId,locationId:order.locationId,actorId:access.identity.subject,cancellationComment:comment,createdAt:now});
            } else {
                tx.update(orderRef,{status});
            }
        });
        if(status==='Completed'||status==='Delivered'){
            try { await queueOrderFeedback(orderId,true); } catch { /* Optional messaging never rolls back a saved status. */ }
        }
        revalidatePath('/superadmin/sales/orders');
        revalidatePath('/merchant/orders');
        revalidatePath(`/superadmin/sales/orders/${orderId}`);
        revalidatePath('/superadmin/sales/dashboard');
        return {success:true,message:status === 'Canceled' ? 'Order canceled. It is excluded from sales.' : `Order status updated to ${status}.`};
    } catch(error) {
        const message=error instanceof Error?error.message:'An unknown error occurred';
        return {success:false,message:`Failed to update status: ${message}`};
    }
}
