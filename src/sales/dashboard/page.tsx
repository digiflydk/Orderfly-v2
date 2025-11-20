

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Users, Activity, Percent, Ban, Truck, HandCoins, Tags, Banknote } from "lucide-react";
import type { OrderSummary } from "@/types";
import { getAdminDb } from "@/lib/firebase-admin";

export const revalidate = 0; // Force dynamic rendering

async function getOrdersFromFirestore(): Promise<OrderSummary[]> {
    const db = getAdminDb();
    const ordersCol = db.collection('orders');
    const orderSnapshot = await ordersCol.get();
    const orderList = orderSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            createdAt: (data.createdAt as any).toDate()
        } as OrderSummary;
    });
    return orderList;
}

const getSalesDashboardData = async () => {
    const orders = await getOrdersFromFirestore();
    const nonCancelledOrders = orders.filter(o => o.status !== 'Canceled');

    const totalOrders = nonCancelledOrders.length;
    const totalSales = nonCancelledOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    const deliveryOrdersCount = nonCancelledOrders.filter(o => o.deliveryType === 'Delivery').length;
    const pickupOrdersCount = nonCancelledOrders.filter(o => o.deliveryType === 'Pickup').length;
    const deliveryPickupRatio = totalOrders > 0 
        ? `${Math.round((deliveryOrdersCount / totalOrders) * 100)}% / ${Math.round((pickupOrdersCount / totalOrders) * 100)}%`
        : 'N/A';
        
    const canceledOrders = orders.length - nonCancelledOrders.length;

    const totalDiscounts = nonCancelledOrders.reduce((sum, order) => sum + (order.paymentDetails?.discountTotal ?? 0), 0);
    const totalTips = nonCancelledOrders.reduce((sum, order) => sum + (order.paymentDetails?.tips ?? 0), 0);
    
    const paymentMethods = [...new Set(nonCancelledOrders.map(o => o.paymentMethod))].join(', ') || 'N/A';

    return {
        kpis: [
            { title: "Total Orders", value: totalOrders.toLocaleString(), icon: ShoppingCart },
            { title: "Total Sales", value: `kr. ${totalSales.toFixed(2)}`, icon: DollarSign },
            { title: "Average Order Value", value: `kr. ${avgOrderValue.toFixed(2)}`, icon: Activity },
            { title: "Total Delivery Orders", value: deliveryOrdersCount.toLocaleString(), icon: Truck },
            { title: "Total Pickup Orders", value: pickupOrdersCount.toLocaleString(), icon: HandCoins },
            { title: "Delivery vs Pickup Ratio", value: deliveryPickupRatio, icon: Percent },
            { title: "Canceled Orders", value: canceledOrders.toLocaleString(), icon: Ban },
            { title: "Total Discounts", value: `kr. ${totalDiscounts.toFixed(2)}`, icon: Tags },
            { title: "Total Tips", value: `kr. ${totalTips.toFixed(2)}`, icon: HandCoins },
            { title: "Payment Methods", value: paymentMethods, icon: Banknote },
        ]
    }
}


export default async function SalesDashboardPage() {
    const { kpis } = await getSalesDashboardData();
    
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Sales & Orders Dashboard</h1>
                <p className="text-muted-foreground">
                   An overview of sales metrics and order statistics across the platform.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {kpis.map((kpi) => (
                    <Card key={kpi.title}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {kpi.title}
                            </CardTitle>
                            <kpi.icon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{kpi.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Sales Over Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Line chart will be displayed here.</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Payment Method Split</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Pie chart will be displayed here.</p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
