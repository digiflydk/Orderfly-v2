

// src/lib/superadmin/getOrders.ts
import { getAdminDb } from '@/lib/firebase-admin';
import type { OrderSummary } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';
import { startOfDay, endOfDay } from 'date-fns';
import * as admin from 'firebase-admin';

export async function getOrders(filters?: Partial<SACommonFilters>): Promise<OrderSummary[]> {
  const db = getAdminDb();
  let q: admin.firestore.Query = db.collection('orders').orderBy('createdAt', 'desc');

  if (filters?.dateFrom && filters?.dateTo) {
      q = q
          .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startOfDay(new Date(filters.dateFrom))))
          .where('createdAt', '<=', admin.firestore.Timestamp.fromDate(endOfDay(new Date(filters.dateTo))));
  }

  const querySnapshot = await q.get();
  const orders = querySnapshot.docs.map((doc): OrderSummary => {
      const data = doc.data() as Omit<OrderSummary, 'id' | 'createdAt'> & {
          createdAt: admin.firestore.Timestamp;
      };

      return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt.toDate(),
      };
  });
  return orders;
}
