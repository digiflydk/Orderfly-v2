
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { OrderDetail } from '@/types';

const COL_ORDERS = process.env.FS_COL_ORDERS || 'orders';
const OK_STATUSES = ['paid', 'completed', 'delivered', 'Paid', 'Completed', 'Delivered', 'Ready'];

interface PurchaseParams {
    startDate: Date;
    endDate: Date;
    brandId?: string;
    locationId?: string;
}

interface PurchaseResult {
    brandId: string;
    locationId: string;
    count: number;
    revenue: number;
    deliveryFee: number;
    discount: number;
    sessionIds: Set<string>;
}

export async function getPurchasesInRange(params: PurchaseParams): Promise<PurchaseResult[]> {
    const db = getAdminDb();
    let q = query(
        collection(db, COL_ORDERS),
        where('createdAt', '>=', Timestamp.fromDate(params.startDate)),
        where('createdAt', '<=', Timestamp.fromDate(params.endDate))
    );
    
    // We filter brandId and locationId later in code to avoid composite indexes for now
    
    const snap = await getDocs(q);
    const ordersByLocation = new Map<string, { count: number, revenue: number, deliveryFee: number, discount: number, sessionIds: Set<string> }>();

    snap.forEach(doc => {
        const order = doc.data() as OrderDetail;
        
        // Filter for paid orders in code to avoid composite index
        if (!OK_STATUSES.includes(order.paymentStatus)) {
            return;
        }

        // Additional filtering for brand and location
        if (params.brandId && params.brandId !== 'all' && order.brandId !== params.brandId) {
            return;
        }
        if (params.locationId && params.locationId !== 'all' && order.locationId !== params.locationId) {
            return;
        }

        const key = `${order.brandId}_${order.locationId}`;
        if (!ordersByLocation.has(key)) {
            ordersByLocation.set(key, { count: 0, revenue: 0, deliveryFee: 0, discount: 0, sessionIds: new Set() });
        }
        const bucket = ordersByLocation.get(key)!;
        bucket.count++;
        bucket.revenue += order.totalAmount || 0;
        bucket.deliveryFee += order.paymentDetails?.deliveryFee ?? 0;
        bucket.discount += order.paymentDetails?.discountTotal ?? 0;
        const sessionId = order.psp?.checkoutSessionId || order.customerDetails.id || order.id;
        bucket.sessionIds.add(sessionId);
    });

    return Array.from(ordersByLocation.entries()).map(([key, data]) => {
        const [brandId, locationId] = key.split('_');
        return { brandId, locationId, ...data };
    });
}
