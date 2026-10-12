

// src/lib/superadmin/getOrders.ts
import { orderflyReadGrants } from '@/lib/access/orderfly-session';
import { getAdminDb } from '@/lib/firebase-admin';
import type { OrderSummary } from '@/types';
import type { SACommonFilters } from '@/types/superadmin';
import { analyticsDateRange } from '@/lib/analytics/date-range';
import * as admin from 'firebase-admin';

function firestoreDate(value: unknown): Date | undefined {
  const date = value instanceof Date ? value : value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : undefined;
  return date instanceof Date && Number.isFinite(date.getTime()) ? date : undefined;
}

export async function getOrders(filters?: Partial<SACommonFilters>, sortBy: 'paidAt' | 'createdAt' = 'paidAt'): Promise<OrderSummary[]> {
  const db = getAdminDb();
  let q: admin.firestore.Query = db.collection('orders');

  if (filters?.dateFrom && filters?.dateTo) {
      const { start, endExclusive } = analyticsDateRange(filters.dateFrom, filters.dateTo);
      q = q
          .where('paidAt', '>=', admin.firestore.Timestamp.fromDate(start))
          .where('paidAt', '<', admin.firestore.Timestamp.fromDate(endExclusive));
  }

  const grants=await orderflyReadGrants('orderfly.orders:view');
  const snapshots=await Promise.all(grants.flatMap(grant=>{
    const scoped=q.where('brandId','==',grant.brandId);
    if(grant.locationIds===null)return [scoped.get()];
    const queries=[];
    for(let i=0;i<grant.locationIds.length;i+=30)queries.push(scoped.where('locationId','in',grant.locationIds.slice(i,i+30)).get());
    return queries;
  }));
  const documents=[...new Map(snapshots.flatMap(snapshot=>snapshot.docs).map(doc=>[doc.id,doc])).values()];
  const orders = documents.map((doc): OrderSummary => {
      const data = doc.data() as Omit<OrderSummary, 'id' | 'createdAt'> & {
          createdAt?: admin.firestore.Timestamp | Date;
          paidAt?: admin.firestore.Timestamp | Date;
      };

      return {
          ...data,
          id: doc.id,
          createdAt: firestoreDate(data.createdAt) || new Date(0),
          ...(firestoreDate(data.paidAt) ? { paidAt: firestoreDate(data.paidAt) } : {}),
      };
  });
  return orders.sort((a,b)=>((sortBy === 'paidAt' ? b.paidAt?.getTime() : b.createdAt.getTime()) ?? -Infinity)-((sortBy === 'paidAt' ? a.paidAt?.getTime() : a.createdAt.getTime()) ?? -Infinity));
}
