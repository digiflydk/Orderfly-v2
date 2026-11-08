import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { isPaidSale } from '@/lib/paid-order';
/** Only non-refunded paid orders can provide unambiguous unit counts. */
export const upsellSales = unstable_cache(async (brandId: string, locationId: string) => {
    const snapshot = await getAdminDb().collection('orders').where('brandId', '==', brandId).where('paidAt', '>=', new Date(Date.now() - 30 * 86400000)).get();
    const sales: Record<string, number> = {};
    for (const row of snapshot.docs) {
        const order = row.data();
        if (order.locationId !== locationId || !isPaidSale(order) || order.refundedAmountOre > 0)
            continue;
        for (const item of order.productItems || []) {
            if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0)
                continue;
            const ids = item.itemType === 'combo'
                ? (item.comboSelections || []).flatMap((group: {
                    products?: {
                        id: string;
                    }[];
                }) => (group.products || []).map(p => p.id))
                : [item.id];
            for (const id of ids)
                if (typeof id === 'string')
                    sales[id] = (sales[id] || 0) + item.quantity;
        }
    }
    return sales;
}, ['upsell-sales-30d-v1'], { revalidate: 300 });
