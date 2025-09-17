
'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

export type FeedbackEntry = {
  id: string;
  createdAt: number | null;
  rating?: number | null;
  comment?: string | null;
  brandId?: string | null;
  locationId?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  version?: string | null;
  visible?: boolean | null;
};

export async function getFeedbackEntries(): Promise<FeedbackEntry[]> {
  const col = collection(db, 'feedback');
  const q = query(col, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  const items: FeedbackEntry[] = [];
  snap.forEach((doc) => {
    const d = doc.data() as any;

    const createdAt: number | null =
      typeof d?.createdAt === 'number'
        ? d.createdAt
        : (d?.createdAt?.toMillis?.() ?? null);

    items.push({
      id: doc.id,
      createdAt,
      rating: d?.rating ?? null,
      comment: d?.comment ?? null,
      brandId: d?.brandId ?? null,
      locationId: d?.locationId ?? null,
      customerId: d?.customerId ?? null,
      orderId: d?.orderId ?? null,
      version: d?.version ?? null,
      visible: typeof d?.visible === 'boolean' ? d.visible : null,
    });
  });

  return items;
}
