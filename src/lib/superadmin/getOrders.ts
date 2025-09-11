
// src/lib/superadmin/getOrders.ts
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, Timestamp, where } from 'firebase/firestore';
import type { OrderSummary } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';
import { startOfDay, endOfDay } from 'date-fns';

export async function getOrders(filters?: Partial<SACommonFilters>): Promise<OrderSummary[]> {
  let q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));

  if (filters?.dateFrom && filters?.dateTo) {
      q = query(q, 
          where('createdAt', '>=', Timestamp.fromDate(startOfDay(new Date(filters.dateFrom)))),
          where('createdAt', '<=', Timestamp.fromDate(endOfDay(new Date(filters.dateTo))))
      );
  }

  const querySnapshot = await getDocs(q);
  const orders = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return { 
          id: doc.id,
          ...data,
          createdAt: (data.createdAt as Timestamp).toDate(),
          paidAt: (data.paidAt as Timestamp)?.toDate(),
          updatedAt: (data.updatedAt as Timestamp)?.toDate(),
        } as OrderSummary;
  });
  return orders;
}
