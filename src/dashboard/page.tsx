

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, Users, Activity } from "lucide-react";
import type { OrderSummary } from "@/types";
import { getBrands } from "../brands/actions";
import { collection, getDocs } from "firebase/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

export const revalidate = 0; // Force dynamic rendering

async function getOrdersFromFirestore(): Promise<OrderSummary[]> {
    const db = getAdminDb();
    const ordersCol = collection(db, 'orders');
    const orderSnapshot = await getDocs(ordersCol);
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

const getDashboardData = async () => {
    const orders = await getOrdersFromFirestore();
    const brands = await getBrands();

    const totalOrders = orders.length;
    const totalSales = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const activeBrands = brands.filter(b => b.status === 'active').length;
    const totalCustomers = new Set(orders.map(o => o.customerContact)).size;

    return {
        metrics: [
            { title: "Total Revenue", value: `kr. ${totalSales.toFixed(2)}`, icon: DollarSign },
            { title: "Total Orders", value: totalOrders.toLocaleString(), icon: ShoppingCart },
            { title: "Active Brands", value: activeBrands.toLocaleString(), icon: Users },
            { title: "Unique Customers", value: totalCustomers.toLocaleString(), icon: Activity },
        ]
    }
}


export default async function SuperAdminDashboard() {
  const { metrics } = await getDashboardData();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SuperAdmin Dashboard</h1>
        <p className="text-muted-foreground">
          Platform-wide overview and key metrics based on real-time activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {metric.title}
              </CardTitle>
              <metric.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
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
             <p className="text-muted-foreground">Sales chart will be displayed here, based on real order data.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
             <p className="text-muted-foreground">A feed of recent orders and platform events will be shown here.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
