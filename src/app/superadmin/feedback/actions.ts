

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
  writeBatch
} from 'firebase/firestore';
import type { Feedback, FeedbackQuestionsVersion, OrderDetail } from '@/types';
import { getOrderById } from '@/app/checkout/order-actions';


export async function getFeedbackEntries(): Promise<Feedback[]> {
    const q = query(collection(db, 'feedback'), orderBy('receivedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const feedbackEntries = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            id: doc.id,
            receivedAt: (data.receivedAt as any).toDate(),
        } as Feedback;
    });
    return feedbackEntries;
}

export async function getFeedbackById(id: string): Promise<Feedback | null> {
    const docRef = doc(db, 'feedback', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data();
        return { 
            id: docSnap.id, 
            ...data,
            receivedAt: (data.receivedAt as any).toDate(),
        } as Feedback;
    }
    return null;
}

export async function updateFeedback(feedbackId: string, data: Partial<Pick<Feedback, 'showPublicly' | 'maskCustomerName' | 'internalNote'>>) {
    try {
        const feedbackRef = doc(db, 'feedback', feedbackId);
        await setDoc(feedbackRef, data, { merge: true });
        revalidatePath(`/superadmin/feedback`);
        revalidatePath(`/superadmin/feedback/${feedbackId}`);
        return { message: "Feedback updated successfully.", error: false };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to update feedback: ${errorMessage}`, error: true };
    }
}

export async function deleteFeedback(id: string) {
    try {
        await deleteDoc(doc(db, "feedback", id));
        revalidatePath("/superadmin/feedback");
        return { message: "Feedback deleted successfully.", error: false };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete feedback: ${errorMessage}`, error: true };
    }
}

export async function sendFeedbackRequestEmail(orderId: string) {
    console.log(`[Action] Attempting to send feedback email for order: ${orderId}`);
    try {
        const order = await getOrderById(orderId);
        if (!order) {
            console.error(`Order with ID ${orderId} not found.`);
            return { error: 'Order not found.' };
        }
        
        const feedbackLink = `http://localhost:9002/feedback?orderId=${order.id}&customerId=${order.customerDetails.id}`;

        const email = {
            to: order.customerContact,
            from: 'feedback@orderfly.app',
            subject: `How was your order from ${order.brandName}?`,
            htmlBody: `
                <h1>Hi ${order.customerName},</h1>
                <p>Thanks for your recent order from ${order.brandName}!</p>
                <p>We'd love to get your feedback on order #${order.id}.</p>
                <a href="${feedbackLink}">Give Feedback</a>
                <p>Thanks,</p>
                <p>The ${order.brandName} Team</p>
            `
        };

        console.log("--- SIMULATING EMAIL ---");
        console.log(`To: ${email.to}`);
        console.log(`Subject: ${email.subject}`);
        console.log("Body:", email.htmlBody);
        console.log("------------------------");
        
        revalidatePath(`/superadmin/sales/orders/${orderId}`);
        return { success: true, message: `Simulated sending feedback email to ${email.to}. Check console for link.` };

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        console.error(`Failed to send feedback email for order ${orderId}:`, e);
        return { error: errorMessage };
    }
}

// --- Feedback Questions ---

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

  Object.keys(payload).forEach(k => (payload as any)[k] === undefined && delete (payload as any)[k]);

  if (id) {
    const ref = doc(db, 'feedbackConfig', 'default', 'questions', id);
    await updateDoc(ref, payload);
  } else {
    await addDoc(questionsParent(), {
      ...payload,
      createdAt: now,
      createdAtServer: serverTimestamp(),
    });
  }

  redirect('/superadmin/feedback/questions');
}

// Form payload type spejler client-schema, men vi tillader ekstra felter
type CreateQuestionPayload = {
  title: string;
  helpText?: string;
  type: string;
  required: boolean;
  category?: string;
  language: string;
  isActive: boolean;
  options: { id: string; label: string; value: string }[];
} & Record<string, any>;

/**
 * Opretter:
 *  - /feedbackQuestions/{questionId}
 *  - /feedbackQuestions/{questionId}/versions/{auto}
 */
export async function createFeedbackQuestion(payload: CreateQuestionPayload) {
  // Collection navne – justér KUN hvis jeres naming er anderledes (spørg først!)
  const questionsCol = collection(db, "feedbackQuestions");

  // Opret spørgsmål
  const questionRef = await addDoc(questionsCol, {
    title: payload.title,
    helpText: payload.helpText ?? "",
    type: payload.type,
    required: !!payload.required,
    category: payload.category ?? "",
    language: payload.language,
    isActive: !!payload.isActive,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Første version – hvis ikke relevant i jeres model, kan den droppes (spørg først!)
  const versionsCol = collection(questionRef, "versions");
  await addDoc(versionsCol, {
    options: Array.isArray(payload.options) ? payload.options : [],
    isActive: !!payload.isActive,
    language: payload.language,
    notes: "Initial version",
    createdAt: serverTimestamp(),
  });

  // Evt. returnér id til routing/redirect
  return { id: questionRef.id };
}
