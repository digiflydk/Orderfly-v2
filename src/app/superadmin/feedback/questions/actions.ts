'use server';

import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query
} from 'firebase/firestore';

export type FeedbackQuestionVersion = {
  id: string;
  name?: string | null;
  label?: string | null;
  description?: string | null;
  createdAt?: number | null; // number eller Timestamp->millis
  active?: boolean | null;
};

/**
 * Henter versions-liste for feedback-spørgsmål.
 * Robust ift. skema: falder tilbage til usorteret fetch hvis 'createdAt' ikke findes.
 * Kilde: Firestore collection 'feedback/questions'
 */
export async function getFeedbackQuestionVersions(): Promise<FeedbackQuestionVersion[]> {
  const col = collection(db, 'feedback/questions');

  async function fetchOrdered() {
    const q = query(col, orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data: any = d.data() ?? {};
      const createdAt =
        typeof data?.createdAt === 'number'
          ? data.createdAt
          : data?.createdAt?.toMillis?.() ?? null;

      return {
        id: d.id,
        name: data?.name ?? null,
        label: data?.label ?? null,
        description: data?.description ?? null,
        createdAt,
        active: typeof data?.active === 'boolean' ? data.active : null,
      } as FeedbackQuestionVersion;
    });
  }

  async function fetchUnordered() {
    const q = query(col, limit(200));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data: any = d.data() ?? {};
      const createdAt =
        typeof data?.createdAt === 'number'
          ? data.createdAt
          : data?.createdAt?.toMillis?.() ?? null;

      return {
        id: d.id,
        name: data?.name ?? null,
        label: data?.label ?? null,
        description: data?.description ?? null,
        createdAt,
        active: typeof data?.active === 'boolean' ? data.active : null,
      } as FeedbackQuestionVersion;
    });
  }

  try {
    return await fetchOrdered();
  } catch {
    return await fetchUnordered();
  }
}
