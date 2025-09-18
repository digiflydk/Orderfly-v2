
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
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

function questionsParentPath() {
  return collection(db, 'feedbackConfig', 'default', 'questions');
}

type QuestionVersion = {
  id?: string;
  // Almene felter (bevidst brede for at matche eksisterende form)
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
  // Meta
  parentId?: string | null;
};

function toMillis(v: any): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

function parseBoolean(input: FormDataEntryValue | null): boolean | null {
  if (input === null || input === undefined) return null;
  const s = String(input).toLowerCase().trim();
  if (['true', '1', 'on', 'yes'].includes(s)) return true;
  if (['false', '0', 'off', 'no'].includes(s)) return false;
  return null;
}

function parseJson(input: FormDataEntryValue | null): any {
  if (input == null) return undefined;
  try {
    return JSON.parse(String(input));
  } catch {
    return undefined;
  }
}

/**
 * Robust loader:
 * 1) Prøv: feedbackConfig/default/questions/{id}
 * 2) Fallback: collectionGroup('questions') hvor __name__ == id
 */
export async function getQuestionVersionById(id: string): Promise<QuestionVersion | null> {
  if (!id) return null;

  // 1) Primær sti
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

  // 2) Fallback via collectionGroup
  const g = collectionGroup(db, 'questions');
  const q = query(g, where(documentId(), '==', id), limit(1));
  const groupSnap = await getDocs(q);
  if (!groupSnap.empty) {
    const docSnap = groupSnap.docs[0];
    const d: any = docSnap.data() ?? {};
    return {
      id: docSnap.id,
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
      parentId: docSnap.ref.parent?.parent?.id ?? null,
    };
  }

  return null;
}

/**
 * Opret eller opdater question version.
 * (Bevarer bredt felt-set for at matche eksisterende form.)
 */
export async function createOrUpdateQuestionVersion(formData: FormData) {
  const id = (formData.get('id') ?? '').toString().trim() || null;

  const label = (formData.get('label') ?? formData.get('name') ?? '').toString().trim() || null;
  const name = (formData.get('name') ?? '').toString().trim() || null;
  const description = (formData.get('description') ?? '').toString().trim() || null;
  const language = (formData.get('language') ?? '').toString().trim() || null;
  const active = parseBoolean(formData.get('active'));

  const orderTypesRaw = formData.getAll('orderTypes');
  const orderTypes: string[] | null = orderTypesRaw && orderTypesRaw.length
    ? orderTypesRaw.map(v => String(v)).filter(Boolean)
    : null;

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

  // Ryd undefined så vi ikke skriver tomme felter utilsigtet
  Object.keys(payload).forEach(k => payload[k] === undefined && delete (payload as any)[k]);

  if (id) {
    const ref = doc(db, 'feedbackConfig', 'default', 'questions', id);
    await updateDoc(ref, payload);
  } else {
    await addDoc(questionsParentPath(), {
      ...payload,
      createdAt: now,
      createdAtServer: serverTimestamp(),
    });
  }

  redirect('/superadmin/feedback/questions');
}
