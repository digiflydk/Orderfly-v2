

import { getAdminDb } from '@/lib/firebase-admin';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { getBrands } from "@/app/superadmin/brands/actions";
import { getAllLocations } from "@/app/superadmin/locations/actions";
import { OrdersClientPage, type ClientOrderSummary } from "./client-page";
import type { OrderSummary } from "@/types";

export const revalidate = 0; // Force dynamic rendering

async function getOrders(): Promise<OrderSummary[]> {
  const db = getAdminDb();
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const querySnapshot = await getDocs(q);
  const orders = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return { 
          id: doc.id,
          ...data,
          createdAt: (data.createdAt as Timestamp).toDate(),
          paidAt: (data.paidAt as Timestamp)?.toDate(),
        } as OrderSummary;
  });
  return orders;
}

export default async function OrdersPage() {
    const [orders, brands, locations] = await Promise.all([
        getOrders(),
        getBrands(),
        getAllLocations(),
    ]);
    
    // Serialize date to ISO string to prevent hydration errors
    const serializedOrders: ClientOrderSummary[] = orders.map(order => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        // @ts-ignore
        paidAt: order.paidAt?.toISOString(),
    }));

    return (
        <OrdersClientPage 
            initialOrders={serializedOrders}
            brands={brands}
            locations={locations}
        />
    );
}
