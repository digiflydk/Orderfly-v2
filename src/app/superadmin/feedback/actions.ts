
'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';

/**
 * Storage design:
 * Vi placerer versions-dokumenter som subcollection:
 *   feedbackConfig/default/questions/{versionId}
 * Det gør, at vores listevisning via collectionGroup('questions') kan finde dem.
 */
function questionsParentPath() {
  return collection(db, 'feedbackConfig', 'default', 'questions');
}

function toMillis(v: any): number | null {
  if (typeof v === 'number') return v;
  if (v && typeof (v as any).toMillis === 'function') return (v as any).toMillis();
  if (v instanceof Timestamp) return v.toMillis();
  return null;
}

type QuestionVersionPayload = {
  name?: string | null;
  label?: string | null;
  description?: string | null;
  active?: boolean | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  fields?: any;
};

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
 * Server action: create/update question version.
 * Forventer form fields (alle valgfrie):
 * - id (ved update)
 * - name, label, description
 * - active (true/false/1/0/on/off)
 * - fields (JSON string – valgfrit skema for spørgsmål)
 * Efter succes: redirect til /superadmin/feedback/questions
 */
export async function createOrUpdateQuestionVersion(formData: FormData) {
  const id = (formData.get('id') ?? '').toString().trim() || null;
  const name = (formData.get('name') ?? '').toString().trim() || null;
  const label = (formData.get('label') ?? '').toString().trim() || null;
  const description = (formData.get('description') ?? '').toString().trim() || null;
  const active = parseBoolean(formData.get('active'));
  const fields = parseJson(formData.get('fields'));

  const now = Date.now();

  const payload: QuestionVersionPayload = {
    name: name || null,
    label: label || null,
    description: description || null,
    active,
    updatedAt: now,
  };
  if (fields !== undefined) {
    (payload as any).fields = fields;
  }

  const parent = questionsParentPath();

  if (id) {
    const ref = doc(db, 'feedbackConfig', 'default', 'questions', id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...payload,
      } as any);
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: now,
      } as any);
    }
  } else {
    await addDoc(parent, {
      ...payload,
      createdAt: now,
      createdAtServer: serverTimestamp(),
    } as any);
  }

  redirect('/superadmin/feedback/questions');
}
