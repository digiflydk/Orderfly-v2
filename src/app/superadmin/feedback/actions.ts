
'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

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
  try {
    const q = query(col, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const items: FeedbackEntry[] = [];
    snap.forEach((d) => {
      const x: any = d.data() ?? {};
      items.push({
        id: d.id,
        createdAt: typeof x.createdAt === 'number' ? x.createdAt : x?.createdAt?.toMillis?.() ?? null,
        rating: x?.rating ?? null,
        comment: x?.comment ?? null,
        brandId: x?.brandId ?? null,
        locationId: x?.locationId ?? null,
        customerId: x?.customerId ?? null,
        orderId: x?.orderId ?? null,
        version: x?.version ?? null,
        visible: typeof x?.visible === 'boolean' ? x.visible : null,
      });
    });
    return items;
  } catch {
    const snap = await getDocs(col);
    const items: FeedbackEntry[] = [];
    snap.forEach((d) => {
      const x: any = d.data() ?? {};
      items.push({
        id: d.id,
        createdAt: typeof x.createdAt === 'number' ? x.createdAt : x?.createdAt?.toMillis?.() ?? null,
        rating: x?.rating ?? null,
        comment: x?.comment ?? null,
        brandId: x?.brandId ?? null,
        locationId: x?.locationId ?? null,
        customerId: x?.customerId ?? null,
        orderId: x?.orderId ?? null,
        version: x?.version ?? null,
        visible: typeof x?.visible === 'boolean' ? x.visible : null,
      });
    });
    return items;
  }
}

function questionsParent() {
  return collection(db, 'feedbackConfig', 'default', 'questions');
}

type QuestionVersion = {
  id?: string;
  label?: string | null;
  name?: string | null;
  description?: string | null;
  language?: string | null;
  active?: boolean | null;
  orderTypes?: string[] | null;
  questions?: any[] | null;
  fields?: any;
  createdAt?: number | null;
  updatedAt?: number | null;
  parentId?: string | null;
};

function toMillis(v: any): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

function parseBoolean(v: FormDataEntryValue | null): boolean | null {
  if (v === null || v === undefined) return null;
  const s = String(v).toLowerCase().trim();
  if (['true', '1', 'on', 'yes'].includes(s)) return true;
  if (['false', '0', 'off', 'no'].includes(s)) return false;
  return null;
}

function parseJson(v: FormDataEntryValue | null): any {
  if (v == null) return undefined;
  try {
    return JSON.parse(String(v));
  } catch {
    return undefined;
  }
}

export async function getQuestionVersionById(id: string): Promise<QuestionVersion | null> {
  if (!id) return null;
  const ref = doc(db, 'feedbackConfig', 'default', 'questions', id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d: any = snap.data() ?? {};
    return {
      id,
      label: d.label ?? d.name ?? null,
      name: d.name ?? null,
      description: d.description ?? null,
      language: d.language ?? null,
      active: typeof d.active === 'boolean' ? d.active : null,
      orderTypes: Array.isArray(d.orderTypes) ? d.orderTypes : null,
      questions: Array.isArray(d.questions) ? d.questions : null,
      fields: d.fields,
      createdAt: toMillis(d.createdAt),
      updatedAt: toMillis(d.updatedAt),
      parentId: 'feedbackConfig/default',
    };
  }
  const g = collectionGroup(db, 'questions');
  const q = query(g, where(documentId(), '==', id), limit(1));
  const gr = await getDocs(q);
  if (!gr.empty) {
    const ds = gr.docs[0];
    const d: any = ds.data() ?? {};
    return {
      id: ds.id,
      label: d.label ?? d.name ?? null,
      name: d.name ?? null,
      description: d.description ?? null,
      language: d.language ?? null,
      active: typeof d.active === 'boolean' ? d.active : null,
      orderTypes: Array.isArray(d.orderTypes) ? d.orderTypes : null,
      questions: Array.isArray(d.questions) ? d.questions : null,
      fields: d.fields,
      createdAt: toMillis(d.createdAt),
      updatedAt: toMillis(d.updatedAt),
      parentId: ds.ref.parent?.parent?.id ?? null,
    };
  }
  return null;
}

export async function createOrUpdateQuestionVersion(formData: FormData) {
  const id = (formData.get('id') ?? '').toString().trim() || null;
  const label = (formData.get('label') ?? formData.get('name') ?? '').toString().trim() || null;
  const name = (formData.get('name') ?? '').toString().trim() || null;
  const description = (formData.get('description') ?? '').toString().trim() || null;
  const language = (formData.get('language') ?? '').toString().trim() || null;
  const active = parseBoolean(formData.get('active'));
  const orderTypesRaw = formData.getAll('orderTypes');
  const orderTypes: string[] | null = orderTypesRaw && orderTypesRaw.length ? orderTypesRaw.map((v) => String(v)).filter(Boolean) : null;
  const questionsJson = parseJson(formData.get('questions'));
  const fields = parseJson(formData.get('fields'));
  const now = Date.now();
  const payload: any = {
    label,
    name,
    description,
    language,
    active,
    orderTypes,
    questions: Array.isArray(questionsJson) ? questionsJson : undefined,
    fields: fields !== undefined ? fields : undefined,
    updatedAt: now,
  };
  Object.keys(payload).forEach((k) => (payload as any)[k] === undefined && delete (payload as any)[k]);
  if (id) {
    const ref = doc(db, 'feedbackConfig', 'default', 'questions', id);
    await updateDoc(ref, payload);
  } else {
    await addDoc(questionsParent(), { ...payload, createdAt: now, createdAtServer: serverTimestamp() });
  }
  redirect('/superadmin/feedback/questions');
}
