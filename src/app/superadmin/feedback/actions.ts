
'use server';

import { revalidatePath } from 'next/cache';
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
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Feedback, FeedbackQuestionsVersion, OrderDetail } from '@/types';
import { getOrderById } from '@/app/checkout/order-actions';
import { z } from 'zod';
import { redirect } from 'next/navigation';

// --- Feedback Entries ---

export async function getFeedbackEntries(): Promise<Feedback[]> {
    const q = query(collection(db, 'feedback'), orderBy('receivedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const feedbackEntries = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            ...data,
            id: doc.id,
            receivedAt: (data.receivedAt as Timestamp).toDate(),
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
            receivedAt: (data.receivedAt as Timestamp).toDate(),
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
  if (v && typeof v.toMillis === 'function') return (v as any).toMillis();
  if (v instanceof Timestamp) return v.toMillis();
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


// Duplicates from the public feedback actions
export async function getActiveFeedbackQuestionsForOrder(
  deliveryType: 'Delivery' | 'Pickup'
): Promise<FeedbackQuestionsVersion | null> {
  const q = query(
    collection(db, 'feedbackQuestionsVersion'), 
    where('isActive', '==', true),
    where('orderTypes', 'array-contains', deliveryType.toLowerCase())
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  // Assuming only one version is active per language/type combo
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as FeedbackQuestionsVersion;
}

const feedbackSubmissionSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  locationId: z.string(),
  brandId: z.string(),
  questionVersionId: z.string(),
  language: z.string(),
  responses: z.any(),
});

export async function submitFeedbackAction(prevState: any, formData: FormData) {
    try {
        const rawData = {
            orderId: formData.get('orderId'),
            customerId: formData.get('customerId'),
            locationId: formData.get('locationId'),
            brandId: formData.get('brandId'),
            questionVersionId: formData.get('questionVersionId'),
            language: formData.get('language'),
            responses: JSON.parse(formData.get('responses') as string || '{}'),
        };
        
        const validatedFields = feedbackSubmissionSchema.safeParse(rawData);

        if (!validatedFields.success) {
            console.error(validatedFields.error.flatten());
            return { message: 'Validation failed.', error: true };
        }
        
        const { responses, ...feedbackBase } = validatedFields.data;

        let rating = 0;
        let npsScore: number | undefined = undefined;
        let comment: string | null = null;
        let tags: string[] = [];
        
        Object.values(responses).forEach((response: any) => {
            if (response.type === 'stars') rating = response.answer;
            if (response.type === 'nps') npsScore = response.answer;
            if (response.type === 'text') comment = response.answer;
            if (response.type === 'multiple_options' && Array.isArray(response.answer)) {
                tags.push(...response.answer);
            }
        });
        
        const newFeedback: Omit<Feedback, 'id'> = {
            ...feedbackBase,
            receivedAt: new Date(),
            rating,
            npsScore,
            comment,
            tags,
            responses,
            showPublicly: false,
            maskCustomerName: false,
            autoResponseSent: false, 
        };
        
        const feedbackRef = doc(collection(db, 'feedback'));
        await setDoc(feedbackRef, { ...newFeedback, id: feedbackRef.id });

        revalidatePath('/superadmin/feedback');
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        console.error('Error submitting feedback:', e);
        return { message: `Failed to submit feedback: ${errorMessage}`, error: true };
    }
    
    redirect('/feedback/thank-you');
}
