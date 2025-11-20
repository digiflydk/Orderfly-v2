

'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import type { OrderDetail } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';

export async function getOrderById(orderId: string): Promise<OrderDetail | null> {
  const db = getAdminDb();
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return null;
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
    const q = db.collection('orders').where('psp.checkoutSessionId', '==', sessionId).limit(1);
    const snap = await q.get();
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
