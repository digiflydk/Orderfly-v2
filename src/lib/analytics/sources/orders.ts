
'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { OrderDetail } from '@/types';
import * as admin from 'firebase-admin';

const COL_ORDERS = process.env.FS_COL_ORDERS || 'orders';
interface PurchaseParams {
    startDate: Date;
    endDate: Date;
    brandId?: string;
    locationId?: string;
    device?: 'all' | 'desktop' | 'mobile';
    utmSource?: string;
}

export interface PurchaseResult {
    brandId: string;
    locationId: string;
    count: number;
    ordersBySession: Record<string, number>;
    revenue: number;
    deliveryFee: number;
    discount: number;
    sessionIds: Set<string>;
    source: string;
    medium: string;
    campaign: string;
    device: string;
    date: string;
}

export async function getPurchasesInRange(params: PurchaseParams): Promise<PurchaseResult[]> {
    const db = getAdminDb();
    let q: admin.firestore.Query = db.collection(COL_ORDERS)
        .where('paidAt', '>=', admin.firestore.Timestamp.fromDate(params.startDate))
        .where('paidAt', '<=', admin.firestore.Timestamp.fromDate(params.endDate));
    
    // We filter brandId and locationId later in code to avoid composite indexes for now
    
    const snap = await q.get();
    const ordersByLocation = new Map<string, { count: number, revenue: number, deliveryFee: number, discount: number, sessionIds: Set<string>, ordersBySession: Record<string, number> }>();

    snap.forEach(doc => {
        const order = doc.data() as OrderDetail;
        
        // Filter for paid orders in code to avoid composite index
        if (order.paymentStatus !== 'Paid') {
            return;
        }

        // Additional filtering for brand and location
        if (params.brandId && params.brandId !== 'all' && order.brandId !== params.brandId) {
            return;
        }
        if (params.locationId && params.locationId !== 'all' && order.locationId !== params.locationId) {
            return;
        }
        const attribution = order.analytics?.attribution;
        const source = attribution?.source || (attribution?.referrerHost ? 'referral' : 'direct / unknown');
        const medium = attribution?.medium || (attribution?.referrerHost ? 'referral' : 'none');
        const campaign = attribution?.campaign || '(not set)';
        const device = order.analytics?.deviceType || 'unknown';
        const paid = order.paidAt as unknown as { toDate?: () => Date } | Date | string;
        const paidDate = typeof (paid as { toDate?: () => Date })?.toDate === 'function' ? (paid as { toDate: () => Date }).toDate() : new Date(paid as Date | string);
        const date = Number.isFinite(paidDate.getTime()) ? paidDate.toISOString().slice(0, 10) : params.endDate.toISOString().slice(0, 10);
        if (params.device && params.device !== 'all' && device !== params.device) return;
        if (params.utmSource && source.toLowerCase() !== params.utmSource.toLowerCase()) return;

        const key = JSON.stringify([order.brandId, order.locationId, source, medium, campaign, device, date]);
        if (!ordersByLocation.has(key)) {
            ordersByLocation.set(key, { count: 0, revenue: 0, deliveryFee: 0, discount: 0, sessionIds: new Set(), ordersBySession: {} });
        }
        const bucket = ordersByLocation.get(key)!;
        bucket.count++;
        bucket.revenue += order.totalAmount || 0;
        bucket.deliveryFee += order.paymentDetails?.deliveryFee ?? 0;
        bucket.discount += order.paymentDetails?.discountTotal ?? 0;
        const sessionId = order.analytics?.sessionId || order.id;
        bucket.sessionIds.add(sessionId);
        bucket.ordersBySession[sessionId] = (bucket.ordersBySession[sessionId] || 0) + 1;
    });

    return Array.from(ordersByLocation.entries()).map(([key, data]) => {
        const [brandId, locationId, source, medium, campaign, device, date] = JSON.parse(key);
        return { brandId, locationId, source, medium, campaign, device, date, ...data };
    });
}
