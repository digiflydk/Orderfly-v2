'use server';

import { db } from '@/lib/firebase';
import { collectionGroup, getDocs, limit, orderBy, query } from 'firebase/firestore';

export type FeedbackQuestionVersion = {
  id: string;
  name?: string | null;
  label?: string | null;
  description?: string | null;
  createdAt?: number | null;
  active?: boolean | null;
  parentId?: string | null;
};

export async function getFeedbackQuestionVersions(): Promise<FeedbackQuestionVersion[]> {
  const group = collectionGroup(db, 'questions');

  async function fetchOrdered() {
    const q = query(group, orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data: any = d.data() ?? {};
      const createdAt =
        typeof data?.createdAt === 'number'
          ? data.createdAt
          : data?.createdAt?.toMillis?.() ?? null;
      const parentId = d.ref.parent?.parent?.id ?? null;

      return {
        id: d.id,
        name: data?.name ?? null,
        label: data?.label ?? null,
        description: data?.description ?? null,
        createdAt,
        active: typeof data?.active === 'boolean' ? data.active : null,
        parentId,
      };
    });
  }

  async function fetchUnordered() {
    const q = query(group, limit(200));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data: any = d.data() ?? {};
      const createdAt =
        typeof data?.createdAt === 'number'
          ? data.createdAt
          : data?.createdAt?.toMillis?.() ?? null;
      const parentId = d.ref.parent?.parent?.id ?? null;

      return {
        id: d.id,
        name: data?.name ?? null,
        label: data?.label ?? null,
        description: data?.description ?? null,
        createdAt,
        active: typeof data?.active === 'boolean' ? data.active : null,
        parentId,
      };
    });
  }

  try {
    return await fetchOrdered();
  } catch {
    return await fetchUnordered();
  }
}
