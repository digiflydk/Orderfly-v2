

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
  const orders = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return { 
          id: doc.id,
          ...data,
          createdAt: (data.createdAt as admin.firestore.Timestamp).toDate(),
          paidAt: (data.paidAt as admin.firestore.Timestamp)?.toDate(),
          updatedAt: (data.updatedAt as admin.firestore.Timestamp)?.toDate(),
        } as OrderSummary;
  });
  return orders;
}
