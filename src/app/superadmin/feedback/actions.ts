

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, where, Timestamp, getDoc } from 'firebase/firestore';
import { z } from 'zod';
import type { Feedback, FeedbackQuestionsVersion, OrderDetail } from '@/types';
import { redirect } from 'next/navigation';

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
  responses: z.any(), // Will be parsed from JSON
});

export async function submitFeedbackAction(prevState: any, formData: FormData) {
    try {
        const responsesJSON = formData.get('responses') as string;
        const rawData = {
            orderId: formData.get('orderId'),
            customerId: formData.get('customerId'),
            locationId: formData.get('locationId'),
            brandId: formData.get('brandId'),
            questionVersionId: formData.get('questionVersionId'),
            language: formData.get('language'),
            responses: responsesJSON ? JSON.parse(responsesJSON) : {},
        };
        
        const validatedFields = feedbackSubmissionSchema.safeParse(rawData);

        if (!validatedFields.success) {
            console.error(validatedFields.error.flatten());
            return { message: 'Validation failed.', error: true };
        }
        
        const { responses, ...feedbackBase } = validatedFields.data;

        // Process responses to extract core fields
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
            responses, // Now storing the full responses object
            showPublicly: false, // Default to private
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
