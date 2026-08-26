'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { admin, getAdminDb } from '@/lib/firebase-admin';
import { getOrderById } from '@/app/checkout/order-actions';
import type {
  ExperienceFeedbackQuestionsVersion,
  FeedbackExperienceType,
  FeedbackSourceType,
} from '@/lib/feedback/source-types';
import { resolveBookingFeedbackInvitationToken } from '@/lib/integrations/esmeralda-feedback-integration';

export async function getActiveFeedbackQuestionsForExperience(
  experienceType: FeedbackExperienceType,
): Promise<ExperienceFeedbackQuestionsVersion | null> {
  const db = getAdminDb();
  const snapshot = await db.collection('feedbackQuestionsVersion')
    .where('isActive', '==', true)
    .where('orderTypes', 'array-contains', experienceType)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as ExperienceFeedbackQuestionsVersion;
}

export async function getActiveFeedbackQuestionsForOrder(
  deliveryType: 'Delivery' | 'Pickup',
): Promise<ExperienceFeedbackQuestionsVersion | null> {
  return getActiveFeedbackQuestionsForExperience(
    deliveryType.toLowerCase() as 'delivery' | 'pickup',
  );
}

const feedbackSubmissionSchema = z.object({
  sourceType: z.enum(['commerce_order', 'booking']),
  sourceId: z.string().trim().min(1).max(200),
  customerId: z.string().trim().min(1).max(200),
  questionVersionId: z.string().trim().min(1).max(200),
  language: z.string().trim().min(2).max(16),
  invitationToken: z.string().trim().max(4096).optional().nullable(),
  responses: z.record(z.string(), z.any()),
});

type AuthoritativeSource = {
  sourceType: FeedbackSourceType;
  sourceId: string;
  customerId: string;
  locationId: string;
  brandId: string;
  experienceType: FeedbackExperienceType;
  invitationId?: string;
};

async function resolveAuthoritativeSource(
  parsed: z.infer<typeof feedbackSubmissionSchema>,
): Promise<AuthoritativeSource | null> {
  if (parsed.sourceType === 'commerce_order') {
    const order = await getOrderById(parsed.sourceId);
    if (!order || order.customerDetails.id !== parsed.customerId) return null;
    return {
      sourceType: 'commerce_order',
      sourceId: order.id,
      customerId: order.customerDetails.id,
      locationId: order.locationId,
      brandId: order.brandId,
      experienceType: order.deliveryType.toLowerCase() as 'pickup' | 'delivery',
    };
  }

  if (!parsed.invitationToken) return null;
  const invitation = await resolveBookingFeedbackInvitationToken(parsed.invitationToken);
  if (
    !invitation ||
    invitation.booking_id !== parsed.sourceId ||
    invitation.customer_id !== parsed.customerId
  ) {
    return null;
  }

  return {
    sourceType: 'booking',
    sourceId: invitation.booking_id,
    customerId: invitation.customer_id,
    locationId: invitation.location_id,
    brandId: invitation.organization_id,
    experienceType: 'booking',
    invitationId: invitation.invitation_id,
  };
}

function extractCoreResponses(responses: Record<string, any>) {
  let rating = 0;
  let npsScore: number | undefined;
  let comment: string | undefined;
  const tags: string[] = [];

  Object.values(responses).forEach((response: any) => {
    if (response?.type === 'stars' && Number.isFinite(Number(response.answer))) rating = Number(response.answer);
    if (response?.type === 'nps' && Number.isFinite(Number(response.answer))) npsScore = Number(response.answer);
    if (response?.type === 'text' && typeof response.answer === 'string') comment = response.answer.trim() || undefined;
    if ((response?.type === 'multiple_options' || response?.type === 'tags') && Array.isArray(response.answer)) {
      for (const tag of response.answer) if (typeof tag === 'string' && tag.trim()) tags.push(tag.trim());
    }
  });

  return { rating, npsScore, comment, tags };
}

export async function submitFeedbackAction(_prevState: any, formData: FormData) {
  try {
    let responses: Record<string, any> = {};
    try {
      responses = JSON.parse(String(formData.get('responses') || '{}'));
    } catch {
      return { message: 'Invalid feedback payload.', error: true };
    }

    const parsed = feedbackSubmissionSchema.safeParse({
      sourceType: formData.get('sourceType'),
      sourceId: formData.get('sourceId'),
      customerId: formData.get('customerId'),
      questionVersionId: formData.get('questionVersionId'),
      language: formData.get('language'),
      invitationToken: formData.get('invitationToken') || undefined,
      responses,
    });
    if (!parsed.success) return { message: 'Validation failed.', error: true };

    const source = await resolveAuthoritativeSource(parsed.data);
    if (!source) return { message: 'Feedback source could not be verified.', error: true };

    const db = getAdminDb();
    const questionsSnapshot = await db.collection('feedbackQuestionsVersion').doc(parsed.data.questionVersionId).get();
    if (!questionsSnapshot.exists) return { message: 'Feedback form is no longer available.', error: true };
    const questionsData = questionsSnapshot.data() ?? {};
    const allowedTypes = Array.isArray(questionsData.orderTypes) ? questionsData.orderTypes : [];
    if (
      questionsData.isActive !== true ||
      questionsData.language !== parsed.data.language ||
      !allowedTypes.includes(source.experienceType)
    ) {
      return { message: 'Feedback form is not valid for this visit.', error: true };
    }

    const { rating, npsScore, comment, tags } = extractCoreResponses(parsed.data.responses);
    const feedbackRef = db.collection('feedback').doc();
    const feedbackData: Record<string, unknown> = {
      id: feedbackRef.id,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      customerId: source.customerId,
      locationId: source.locationId,
      brandId: source.brandId,
      questionVersionId: parsed.data.questionVersionId,
      language: parsed.data.language,
      responses: parsed.data.responses,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      rating,
      tags,
      showPublicly: false,
      maskCustomerName: false,
      autoResponseSent: false,
      answeredVia: 'webshop',
    };
    if (source.sourceType === 'commerce_order') feedbackData.orderId = source.sourceId;
    if (typeof npsScore === 'number') feedbackData.npsScore = npsScore;
    if (comment) feedbackData.comment = comment;

    if (source.sourceType === 'booking' && source.invitationId) {
      const invitationRef = db.collection('integrationFeedbackInvitations').doc(source.invitationId);
      await db.runTransaction(async (transaction) => {
        const invitationSnapshot = await transaction.get(invitationRef);
        if (!invitationSnapshot.exists) throw new Error('Feedback invitation no longer exists.');
        const invitation = invitationSnapshot.data() ?? {};
        if (invitation.status === 'submitted' && typeof invitation.feedbackId === 'string') return;
        if (invitation.status !== 'active') throw new Error('Feedback invitation is not active.');
        transaction.create(feedbackRef, feedbackData);
        transaction.update(invitationRef, {
          status: 'submitted',
          feedbackId: feedbackRef.id,
          submittedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    } else {
      await feedbackRef.create(feedbackData);
    }

    revalidatePath('/superadmin/feedback');
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    console.error('Error submitting feedback:', e);
    return { message: `Failed to submit feedback: ${errorMessage}`, error: true };
  }

  redirect('/feedback/thank-you');
}
