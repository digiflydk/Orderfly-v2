
'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  query,
  writeBatch,
} from 'firebase/firestore';
import type { Feedback, FeedbackQuestionsVersion, OrderDetail } from '@/types';
import { getOrderById } from '@/app/checkout/order-actions';
import { z } from 'zod';

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

export async function getQuestionVersionById(id: string): Promise<QuestionVersion | null> {
  if (!id) return null;
  const ref = doc(db, 'feedbackConfig', 'default', 'questions', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data: any = snap.data() ?? {};
  return {
    id,
    name: data?.name ?? null,
    label: data?.label ?? null,
    description: data?.description ?? null,
    active: typeof data?.active === 'boolean' ? data.active : null,
    createdAt:
      typeof data?.createdAt === 'number'
        ? data.createdAt
        : data?.createdAt?.toMillis?.() ?? null,
    updatedAt:
      typeof data?.updatedAt === 'number'
        ? data.updatedAt
        : data?.updatedAt?.toMillis?.() ?? null,
    fields: data?.fields,
  };
}


const questionOptionSchema = z.object({
    id: z.string(),
    label: z.string().min(1, "Option label cannot be empty."),
});

const questionSchema = z.object({
  questionId: z.string().min(1),
  label: z.string().min(3, "Label must be at least 3 characters."),
  type: z.enum(['stars', 'nps', 'text', 'tags', 'multiple_options']),
  isRequired: z.boolean(),
  options: z.array(questionOptionSchema).optional(),
  minSelection: z.coerce.number().optional(),
  maxSelection: z.coerce.number().optional(),
});

const feedbackQuestionVersionSchema = z.object({
  id: z.string().optional(),
  versionLabel: z.string().min(1, "Version label is required."),
  isActive: z.boolean().default(false),
  language: z.string().min(2, "Language code is required."),
  orderTypes: z.array(z.enum(['pickup', 'delivery'])).min(1, 'At least one order type must be selected.'),
  questions: z.array(questionSchema).min(1, "At least one question is required."),
});

/**
 * Server action: create/update question version.
 */
export async function createOrUpdateQuestionVersion(formData: FormData) {
    const rawData = {
        id: formData.get('id') as string || undefined,
        versionLabel: formData.get('versionLabel'),
        isActive: formData.get('isActive') === 'on',
        language: formData.get('language'),
        orderTypes: formData.getAll('orderTypes'),
        questions: JSON.parse(formData.get('questions') as string || '[]'),
    };

    const validatedFields = feedbackQuestionVersionSchema.safeParse(rawData);
    if (!validatedFields.success) {
        return { message: "Validation failed", error: true, errors: validatedFields.error.flatten().fieldErrors };
    }
    
    const { id, ...versionData } = validatedFields.data;
    const batch = writeBatch(db);

    // If making this version active, ensure no other version for the same language/orderType combo is active
    if (versionData.isActive) {
        for (const orderType of versionData.orderTypes) {
            const q = query(
                collection(db, 'feedbackQuestionsVersion'), 
                where('language', '==', versionData.language),
                where('isActive', '==', true),
                where('orderTypes', 'array-contains', orderType)
            );
            const activeSnapshot = await getDocs(q);
            activeSnapshot.forEach(doc => {
                if (doc.id !== id) {
                    batch.update(doc.ref, { isActive: false });
                }
            });
        }
    }
    
    const docRef = id ? doc(db, 'feedbackQuestionsVersion', id) : doc(collection(db, 'feedbackQuestionsVersion'));
    batch.set(docRef, { ...versionData, id: docRef.id }, { merge: true });

    await batch.commit();

    revalidatePath('/superadmin/feedback/questions');
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

type QuestionVersion = {
  id?: string;
  name?: string | null;
  label?: string | null;
  description?: string | null;
  active?: boolean | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  fields?: any;
};
