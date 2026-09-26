
'use server';

// src/lib/superadmin/getSalesSummary.ts
import { listScopedDocuments } from '@/lib/access/scoped-data';
import { Timestamp } from 'firebase-admin/firestore';
import type { OrderSummary } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';
import { startOfDay, endOfDay } from 'date-fns';

type SalesOrderItem = {
    itemType?: 'product' | 'combo';
    totalPrice: number;
};

type SalesOrder = OrderSummary & {
    productItems?: SalesOrderItem[];
};

export const getSalesDashboardData = async (filters: SACommonFilters) => {
    const queryFilters: Array<[string, any, any]> = [
      ['createdAt', '>=', Timestamp.fromDate(startOfDay(new Date(filters.dateFrom)))],
      ['createdAt', '<=', Timestamp.fromDate(endOfDay(new Date(filters.dateTo)))],
    ];
    if(filters.brandId && filters.brandId !== 'all')queryFilters.push(['brandId', '==', filters.brandId]);
    if(filters.locationIds?.length && filters.locationIds.length<=30)queryFilters.push(['locationId', 'in', filters.locationIds]);
    const orderDocs = await listScopedDocuments('orders','orderfly.analytics:view','location',queryFilters);
    let orders: SalesOrder[] = orderDocs.map(doc => doc.data() as SalesOrder);
    
    if (filters.locationIds && filters.locationIds.length > 30) {
        const locationSet = new Set(filters.locationIds);
        orders = orders.filter(o => locationSet.has(o.locationId));
    }

    const paidOrders = orders.filter(o => o.paymentStatus === 'Paid' && o.status !== 'Canceled');
    const pendingOrdersCount = orders.filter(o => o.paymentStatus === 'Pending' && o.status !== 'Canceled').length;
    const totalOrders = paidOrders.length;
    const totalSales = paidOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    const deliveryOrdersCount = paidOrders.filter(o => o.deliveryType === 'Delivery').length;
    const pickupOrdersCount = paidOrders.filter(o => o.deliveryType === 'Pickup').length;
    
    const deliveryPickupRatio = totalOrders > 0 
        ? `${Math.round((pickupOrdersCount / totalOrders) * 100)}% / ${Math.round((deliveryOrdersCount / totalOrders) * 100)}%`
        : 'N/A';

    const canceledOrders = orders.filter(o => o.status === 'Canceled').length;
    const totalDiscounts = paidOrders.reduce((sum, order) => sum + (order.paymentDetails?.discountTotal ?? 0), 0);
    
    // New KPI Calculations
    const totalUpsellsAmount = paidOrders.reduce((sum, order) => sum + (order.paymentDetails?.upsellAmount ?? 0), 0);
    const comboOrders = paidOrders.filter(order =>
        (order.productItems ?? []).some(item => item.itemType === 'combo')
    );

    const totalComboDealsAmount = comboOrders.reduce((sum, order) => {
        const comboItemsTotal = (order.productItems ?? [])
            .filter(item => item.itemType === 'combo')
            .reduce((itemSum, item) => itemSum + item.totalPrice, 0);

        return sum + comboItemsTotal;
    }, 0);
    const totalComboDealsOrders = comboOrders.length;
    
    return {
        kpis: {
            totalOrders,
            totalSales,
            avgOrderValue,
            deliveryOrdersCount,
            pickupOrdersCount,
            deliveryPickupRatio,
            canceledOrders,
            pendingOrders: pendingOrdersCount,
            totalDiscounts,
            // New KPIs
            totalUpsellsAmount,
            totalComboDealsAmount,
            totalComboDealsOrders,
        },
    }
}
