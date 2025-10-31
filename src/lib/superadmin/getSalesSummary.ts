
'use server';

// src/lib/superadmin/getSalesSummary.ts
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import type { OrderSummary, Customer, Feedback } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';
import { startOfDay, endOfDay, subDays } from 'date-fns';

export const getSalesDashboardData = async (filters: SACommonFilters) => {
    let q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(startOfDay(new Date(filters.dateFrom)))),
        where('createdAt', '<=', Timestamp.fromDate(endOfDay(new Date(filters.dateTo))))
    );
    if(filters.brandId && filters.brandId !== 'all') {
        q = query(q, where('brandId', '==', filters.brandId));
    }
    if(filters.locationIds && filters.locationIds.length > 0) {
        if(filters.locationIds.length <= 30) {
           q = query(q, where('locationId', 'in', filters.locationIds));
        } else {
            console.warn("Location filter exceeds 30 items, query will be less efficient.");
        }
    }
    
    const [ordersSnapshot, brandsSnap, locationsSnap, customersSnap, feedbackSnap, cookieSnap] = await Promise.all([
        getDocs(q),
        getDocs(collection(db, 'brands')),
        getDocs(collection(db, 'locations')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'feedback')),
        getDocs(collection(db, 'anonymous_cookie_consents')),
    ]);
    
    let orders: OrderSummary[] = ordersSnapshot.docs.map(doc => doc.data() as OrderSummary);
    
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
    
    const totalActiveBrands = brandsSnap.docs.filter(b => b.data().status === 'active').length;
    const totalActiveLocations = locationsSnap.docs.filter(l => l.data().isActive).length;

    // New KPI Calculations
    const totalUpsellsAmount = paidOrders.reduce((sum, order) => sum + (order.paymentDetails?.upsellAmount ?? 0), 0);
    const comboOrders = paidOrders.filter(o => o.productItems.some(item => item.itemType === 'combo'));
    const totalComboDealsAmount = comboOrders.reduce((sum, order) => {
        const comboItemsTotal = order.productItems
            .filter(item => item.itemType === 'combo')
            .reduce((itemSum, item) => itemSum + item.totalPrice, 0);
        return sum + comboItemsTotal;
    }, 0);
    const totalComboDealsOrders = comboOrders.length;
    
    const allCustomers = customersSnap.docs.map(doc => doc.data() as Customer);
    const totalUniqueCustomers = allCustomers.length;
    
    const sixtyDaysAgo = subDays(new Date(), 60);
    const returningCustomers = allCustomers.filter(c => c.totalOrders > 1 && c.lastOrderDate && c.lastOrderDate >= sixtyDaysAgo).length;
    const totalRetentionRate = totalUniqueCustomers > 0 ? (returningCustomers / totalUniqueCustomers) * 100 : 0;
    
    const totalFeedbacks = feedbackSnap.size;
    const totalCookieConsents = cookieSnap.size;


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
            totalUniqueCustomers,
            totalRetentionRate,
            totalFeedbacks,
            totalCookieConsents,
        },
        totalActiveBrands,
        totalActiveLocations,
    }
}
