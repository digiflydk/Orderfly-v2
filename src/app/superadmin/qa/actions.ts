
'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, orderBy, query, runTransaction
} from 'firebase/firestore';
import { type QaStepTemplate } from '@/app/superadmin/qa/qa-utils';

export type QaStatus = 'Draft' | 'Ready' | 'Deprecated';
export type QaContext = 'public' | 'superadmin';


export type QaTestcase = {
  code: string;                   // auto: OFQ-001, OFQ-002, ...
  title: string;
  acceptanceCriteria: string;
  status: QaStatus;
  stepsTemplate: QaStepTemplate[];
  context: QaContext;
  startPath: string;              // fx "/esmeralda" eller "/sales/orders"
  proofUrl?: string;
  createdAt: number;
  updatedAt: number;
};

const COLL = 'qaTestcases';
const SEQ_DOC = doc(db, 'qaMeta', 'sequence'); // { nextNumber: number }

async function nextCode(): Promise<string> {
  const num = await runTransaction(db, async (tx) => {
    const snap = await tx.get(SEQ_DOC);
    const current = snap.exists() ? (snap.data() as { nextNumber: number }).nextNumber : 1;
    tx.set(SEQ_DOC, { nextNumber: current + 1 }, { merge: true });
    return current;
  });
  return `OFQ-${String(num).padStart(3, '0')}`;
}

export async function listQa(): Promise<QaTestcase[]> {
  const q = query(collection(db, COLL), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as QaTestcase);
}

export async function getQa(code: string): Promise<QaTestcase | null> {
  const refDoc = doc(db, COLL, code);
  const snap = await getDoc(refDoc);
  return snap.exists() ? (snap.data() as QaTestcase) : null;
}

// create uden "code" — genereres automatisk
export async function createQa(input: Omit<QaTestcase,'code'|'createdAt'|'updatedAt'>) {
  const now = Date.now();
  const code = await nextCode();
  const payload: QaTestcase = { ...input, code, createdAt: now, updatedAt: now };
  await setDoc(doc(db, COLL, code), payload);
  revalidatePath('/superadmin/qa');
  return code;
}

export async function updateQa(code: string, partial: Partial<Omit<QaTestcase,'code'|'createdAt'>>) {
  await updateDoc(doc(db, COLL, code), { ...partial, updatedAt: Date.now() });
  revalidatePath('/superadmin/qa');
}

export async function deleteQa(code: string) {
  await deleteDoc(doc(db, COLL, code));
  revalidatePath('/superadmin/qa');
}
