'use server';

import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, doc, setDoc, Timestamp, getDoc, writeBatch, where } from 'firebase/firestore';
import type { Feedback, FeedbackQuestionsVersion } from '@/types';
import { redirect } from 'next/navigation';


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

export async function getFeedbackQuestionVersions(): Promise<FeedbackQuestionsVersion[]> {
    const q = query(collection(db, 'feedbackQuestionsVersion'), orderBy('versionLabel', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FeedbackQuestionsVersion));
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


export async function createOrUpdateQuestionVersion(formData: FormData) {
    try {
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

        // If making this version active, ensure no other version for the same language is active
        if (versionData.isActive) {
            const q = query(collection(db, 'feedbackQuestionsVersion'), where('language', '==', versionData.language), where('isActive', '==', true));
            const activeSnapshot = await getDocs(q);
            activeSnapshot.forEach(doc => {
                if (doc.id !== id) {
                    batch.update(doc.ref, { isActive: false });
                }
            });
        }
        
        const docRef = id ? doc(db, 'feedbackQuestionsVersion', id) : doc(collection(db, 'feedbackQuestionsVersion'));
        batch.set(docRef, { ...versionData, id: docRef.id }, { merge: true });

        await batch.commit();

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to save version: ${errorMessage}`, error: true };
    }
    
    revalidatePath('/superadmin/feedback/questions');
    redirect('/superadmin/feedback/questions');
}


export async function sendFeedbackRequestEmail(orderId: string) {
    console.log(`[Action] Attempting to send feedback email for order: ${orderId}`);
    try {
        const order = await getOrderById(orderId);
        if (!order) {
            console.error(`Order with ID ${orderId} not found.`);
            return { error: 'Order not found.' };
        }
        
        // This is where you would integrate with an email sending service like SendGrid, Resend, etc.
        // For now, we will simulate the email by logging its contents to the console.

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
        
        // In a real app, you would add logic here to create a pending Feedback
        // document in Firestore and handle reminders.
        
        revalidatePath(`/superadmin/sales/orders/${orderId}`);
        return { success: true, message: `Simulated sending feedback email to ${email.to}. Check console for link.` };

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        console.error(`Failed to send feedback email for order ${orderId}:`, e);
        return { error: errorMessage };
    }
}
