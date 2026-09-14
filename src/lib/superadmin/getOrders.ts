

// src/lib/superadmin/getOrders.ts
import { orderflyReadGrants } from '@/lib/access/orderfly-session';
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
          createdAt: admin.firestore.Timestamp;
      };

      return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt.toDate(),
      };
  });
  return orders.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
}
