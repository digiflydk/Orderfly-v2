'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readActiveQuestions, readActiveQuestionsForBrand } from '@/lib/feedback/question-store';
import { feedbackMetrics } from '@/lib/feedback/metrics';
import { resolveOrderFeedbackInvitation, completedFeedbackOrder } from '@/lib/feedback/order-invitations';
import { feedbackAutomation, feedbackMailConfig } from '@/lib/feedback/mail-config';
import { pendingFeedbackMessage } from '@/lib/feedback/mail-queue';

import { admin, getAdminDb } from '@/lib/firebase-admin';
import { getOrderById } from '@/app/checkout/order-actions';
import type {
  ExperienceFeedbackQuestionsVersion,
  FeedbackExperienceType,
  FeedbackSourceType,
} from '@/lib/feedback/source-types';
import { validateFeedbackResponses } from '@/lib/feedback/response-validation';
import { resolveBookingFeedbackInvitationToken } from '@/lib/integrations/esmeralda-feedback-integration';

export async function getActiveFeedbackQuestionsForExperience(
  experienceType: FeedbackExperienceType,
  language = 'da',
): Promise<ExperienceFeedbackQuestionsVersion | null> {
  return readActiveQuestions(experienceType, language);
}

export async function getActiveFeedbackQuestionsForOrder(
  deliveryType: 'Delivery' | 'Pickup',
): Promise<ExperienceFeedbackQuestionsVersion | null> {
  return getActiveFeedbackQuestionsForExperience(
    deliveryType.toLowerCase() as 'delivery' | 'pickup',
  );
}

export async function getActiveFeedbackQuestionsForBrand(
  brandId: string,
  experienceType: FeedbackExperienceType,
  language = 'da',
): Promise<ExperienceFeedbackQuestionsVersion | null> {
  return readActiveQuestionsForBrand(brandId, experienceType, language);
}

const feedbackSubmissionSchema = z.object({
  sourceType: z.enum(['commerce_order', 'booking']),
  sourceId: z.string().trim().min(1).max(200),
  customerId: z.string().trim().min(1).max(200),
  questionVersionId: z.string().trim().min(1).max(200),
  language: z.string().trim().min(2).max(16),
  invitationToken: z.string().trim().max(4096).optional().nullable(),
  responses: z.record(z.string(), z.unknown()),
});

type AuthoritativeSource = {
  sourceType: FeedbackSourceType;
  sourceId: string;
  customerId: string;
  locationId: string;
  brandId: string;
  experienceType: FeedbackExperienceType;
  invitationId?: string;
  invitationCollection?: 'feedbackInvitations' | 'integrationFeedbackInvitations';
};

async function resolveAuthoritativeSource(
  parsed: z.infer<typeof feedbackSubmissionSchema>,
): Promise<AuthoritativeSource | null> {
  if (parsed.sourceType === 'commerce_order') {
    const order = await getOrderById(parsed.sourceId);
    if (!order || order.customerDetails.id !== parsed.customerId || !completedFeedbackOrder(order)) return null;
    const invitation = parsed.invitationToken ? await resolveOrderFeedbackInvitation(parsed.invitationToken) : null;
    if (parsed.invitationToken && (!invitation || invitation.sourceId !== order.id || invitation.brandId !== order.brandId || invitation.locationId !== order.locationId || invitation.customerId !== parsed.customerId)) return null;
    return {
      sourceType: 'commerce_order',
      sourceId: order.id,
      customerId: order.customerDetails.id,
      locationId: order.locationId,
      brandId: order.brandId,
      experienceType: order.deliveryType.toLowerCase() as 'pickup' | 'delivery',
      ...(invitation ? { invitationId: invitation.id, invitationCollection: 'feedbackInvitations' as const } : {}),
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
    invitationCollection: 'integrationFeedbackInvitations',
  };
}

function extractCoreResponses(responses: Record<string, { type: string; answer: unknown }>) {
  const metrics = feedbackMetrics({ responses });
  const rating = metrics.rating ?? 0;
  const npsScore = metrics.nps ?? undefined;
  let comment: string | undefined;
  const tags: string[] = [];

  Object.values(responses).forEach((response) => {
    if (response.type === 'text' && typeof response.answer === 'string') comment = response.answer;
    if ((response.type === 'multiple_options' || response.type === 'tags') && Array.isArray(response.answer)) {
      for (const tag of response.answer) if (typeof tag === 'string') tags.push(tag);
    }
  });

  return { rating, npsScore, comment, tags };
}

export async function submitFeedbackAction(_prevState: any, formData: FormData) {
  try {
    let responses: Record<string, unknown> = {};
    try {
      const decoded = JSON.parse(String(formData.get('responses') || '{}'));
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
        return { message: 'Invalid feedback payload.', error: true };
      }
      responses = decoded as Record<string, unknown>;
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
    const [questionsSnapshot, brandSettingsSnapshot] = await Promise.all([
      db.collection('feedbackQuestionsVersion').doc(parsed.data.questionVersionId).get(),
      db.collection('feedbackSettings').doc(source.brandId).get(),
    ]);
    if (!questionsSnapshot.exists) return { message: 'Feedback form is no longer available.', error: true };
    const questionsData = questionsSnapshot.data() ?? {};
    const selectedVersionId = feedbackAutomation(brandSettingsSnapshot.data()).questionVersionId;
    if (selectedVersionId && selectedVersionId !== parsed.data.questionVersionId) return { message: 'Feedback form is no longer assigned to this brand.', error: true };
    const allowedTypes = Array.isArray(questionsData.orderTypes) ? questionsData.orderTypes : [];
    if (
      questionsData.isActive !== true ||
      questionsData.language !== parsed.data.language ||
      !allowedTypes.includes(source.experienceType)
    ) {
      return { message: 'Feedback form is not valid for this visit.', error: true };
    }

    const responseValidation = validateFeedbackResponses(questionsData.questions, parsed.data.responses);
    if (!responseValidation.ok) {
      return { message: responseValidation.error, error: true };
    }
    const validatedResponses = responseValidation.responses;
    const { rating, npsScore, comment, tags } = extractCoreResponses(validatedResponses);

    const feedbackId = createHash('sha256').update(JSON.stringify([source.brandId, source.sourceType, source.sourceId])).digest('hex');
    const feedbackRef = db.collection('feedback').doc(feedbackId);
    const feedbackData: Record<string, unknown> = {
      id: feedbackRef.id,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      customerId: source.customerId,
      locationId: source.locationId,
      brandId: source.brandId,
      questionVersionId: parsed.data.questionVersionId,
      language: parsed.data.language,
      responses: validatedResponses,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
      rating,
      tags,
      showPublicly: false,
      maskCustomerName: true,
      autoResponseSent: false,
      answeredVia: 'webshop',
    };
    if (source.sourceType === 'commerce_order') feedbackData.orderId = source.sourceId;
    if (typeof npsScore === 'number') feedbackData.npsScore = npsScore;
    if (comment) feedbackData.comment = comment;

    const invitationRef = source.invitationId && source.invitationCollection ? db.collection(source.invitationCollection).doc(source.invitationId) : null;
    const thanksRef = db.collection('feedbackMailJobs').doc(feedbackId + '-thankYou');
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(feedbackRef);
      const legacy = source.sourceType === 'commerce_order'
        ? await transaction.get(db.collection('feedback').where('orderId', '==', source.sourceId)) : null;
      const invitationSnapshot = invitationRef ? await transaction.get(invitationRef) : null;
      const invitation = invitationSnapshot?.data();
      if (invitationRef) {
        if (!invitationSnapshot?.exists) throw new Error('Feedback invitation no longer exists.');
        if (invitation?.status === 'submitted') return;
        if (invitation?.status !== 'active') throw new Error('Feedback invitation is not active.');
      }
      if (source.sourceType === 'commerce_order') {
        const current = (await transaction.get(db.collection('orders').doc(source.sourceId))).data();
        if (!current || !completedFeedbackOrder(current) || current.brandId !== source.brandId || current.locationId !== source.locationId || current.customerDetails?.id !== source.customerId) throw new Error('Order is no longer eligible for feedback.');
      }
      const settings = invitationRef && feedbackMailConfig(source.brandId)
        ? feedbackAutomation((await transaction.get(db.collection('feedbackSettings').doc(source.brandId))).data()) : null;
      const thanks = settings?.emailEnabled && settings.autoReplyEnabled ? await transaction.get(thanksRef) : null;
      const legacyId = legacy?.docs.find(doc => doc.data().brandId === source.brandId && doc.data().customerId === source.customerId)?.id;
      const savedId = existing.exists ? existing.id : legacyId || feedbackId;
      if (!existing.exists && !legacyId) transaction.create(feedbackRef, feedbackData);
      if (invitationRef) transaction.update(invitationRef, { status: 'submitted', feedbackId: savedId, submittedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      if (thanks && !thanks.exists && source.invitationId) {
        transaction.create(thanksRef, pendingFeedbackMessage({ ...source, invitationId: source.invitationId, ...(source.sourceType === 'booking' && parsed.data.invitationToken ? { invitationToken: parsed.data.invitationToken } : {}) }, 'thankYou', Date.now()));
      }
    });

    try { revalidatePath('/superadmin/feedback'); } catch (error) { console.error('Feedback cache refresh failed', error); }
  } catch (e) {
    console.error('Feedback submission failed');
    return { message: 'Feedback kunne ikke gemmes. Dine svar er bevaret. Prøv igen.', error: true };
  }

  redirect('/feedback/thank-you');
}
