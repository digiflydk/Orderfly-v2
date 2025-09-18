'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, orderBy, query
} from 'firebase/firestore';

export type QaStatus = 'Draft' | 'Ready' | 'Deprecated';
export type QaTestcase = {
  code: string;
  title: string;
  acceptanceCriteria: string;
  status: QaStatus;
  proofUrl?: string;
  createdAt: number;
  updatedAt: number;
};

const COLL = 'qaTestcases';

export async function listQa(): Promise<QaTestcase[]> {
  const q = query(collection(db, COLL), orderBy('code'));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as QaTestcase);
}

export async function getQa(code: string): Promise<QaTestcase | null> {
  const refDoc = doc(db, COLL, code);
  const snap = await getDoc(refDoc);
  return snap.exists() ? (snap.data() as QaTestcase) : null;
}

export async function createQa(input: Omit<QaTestcase, 'createdAt'|'updatedAt'>) {
  const now = Date.now();
  await setDoc(doc(db, COLL, input.code), { ...input, createdAt: now, updatedAt: now });
  revalidatePath('/superadmin/qa');
}

export async function updateQa(code: string, partial: Partial<Omit<QaTestcase,'code'|'createdAt'>>) {
  await updateDoc(doc(db, COLL, code), { ...partial, updatedAt: Date.now() });
  revalidatePath('/superadmin/qa');
}

export async function deleteQa(code: string) {
  await deleteDoc(doc(db, COLL, code));
  revalidatePath('/superadmin/qa');
}
