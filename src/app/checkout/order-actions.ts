
'use server';

import { doc, getDoc, Timestamp, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import type { OrderDetail } from '@/types';

export async function getOrderById(orderId: string): Promise<OrderDetail | null> {
  const db = getAdminDb();
  const ref = doc(db, 'orders', orderId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data: any = snap.data();
  return {
    id: snap.id,
    ...data,
    createdAt: (data.createdAt as Timestamp)?.toDate?.() ?? data.createdAt ?? null,
    paidAt: (data.paidAt as Timestamp)?.toDate?.() ?? data.paidAt ?? null,
  } as OrderDetail;
}

export async function getOrderByCheckoutSessionId(sessionId: string): Promise<OrderDetail | null> {
    const db = getAdminDb();
    const q = query(
        collection(db, 'orders'),
        where('psp.checkoutSessionId', '==', sessionId),
        limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const doc = snap.docs[0];
    const data = doc.data();
    return { 
        id: doc.id,
        ...data,
        createdAt: (data.createdAt as Timestamp).toDate(),
        paidAt: (data.paidAt as Timestamp)?.toDate(),
     } as OrderDetail;
}
