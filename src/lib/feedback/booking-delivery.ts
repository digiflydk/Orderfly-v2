import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { ESMERALDA_MAIL_SCOPE } from '@/lib/integrations/order-mail-diagnostics';
import { feedbackAutomation } from './mail-config';
import { feedbackSourceKey } from './order-invitations';
import { resolveBookingFeedbackInvitationToken } from '@/lib/integrations/esmeralda-feedback-integration';
import { readActiveQuestionsForBrand } from './question-store';

export const bookingDeliveryInput = z.object({
  organization_id: z.literal(ESMERALDA_MAIL_SCOPE.organization_id),
  brand_id: z.literal(ESMERALDA_MAIL_SCOPE.brand_id),
  location_id: z.string().regex(/^[\w-]{1,160}$/),
  customer_id: z.string().regex(/^[\w-]{1,160}$/),
  booking_id: z.string().uuid(),
  event_id: z.string().uuid(),
  kind: z.enum(['invitation', 'reminder', 'thankYou']),
  recipient_email: z.string().email().max(320),
}).strict();

/** Read-only final delivery check called by the central notification worker. */
export async function bookingDeliveryDecision(input: z.infer<typeof bookingDeliveryInput>) {
  const scope = bookingDeliveryInput.parse(input);
  if (process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID !== scope.organization_id) throw new Error('configuration_mismatch');
  const db = getAdminDb(), key = feedbackSourceKey(scope.brand_id, 'booking', scope.booking_id);
  const [jobDoc, settingsDoc, customer, brand, location, feedback] = await Promise.all([
    db.collection('feedbackMailJobs').doc(key + '-' + scope.kind).get(),
    db.collection('feedbackSettings').doc(scope.brand_id).get(),
    db.collection('customers').doc(scope.customer_id).get(),
    db.collection('brands').doc(scope.brand_id).get(),
    db.collection('locations').doc(scope.location_id).get(),
    db.collection('feedback').doc(key).get(),
  ]);
  const job = jobDoc.data(), settings = feedbackAutomation(settingsDoc.data());
  const stop = { eligible: false } as const;
  if (!job || job.sourceType !== 'booking' || job.sourceId !== scope.booking_id || job.brandId !== scope.brand_id || job.locationId !== scope.location_id || job.customerId !== scope.customer_id || job.eventId !== scope.event_id || !['dispatching', 'accepted', 'uncertain'].includes(job.state)) return stop;
  if (!settings.emailEnabled || brand.data()?.status !== 'active' || location.data()?.brandId !== scope.brand_id || location.data()?.isActive === false || customer.data()?.brandId !== scope.brand_id || String(customer.data()?.email || '').trim().toLowerCase() !== scope.recipient_email.toLowerCase()) return stop;
  const invitation = typeof job.invitationToken === 'string' ? await resolveBookingFeedbackInvitationToken(job.invitationToken) : null;
  if (!invitation || invitation.organization_id !== scope.brand_id || invitation.booking_id !== scope.booking_id || invitation.location_id !== scope.location_id || invitation.customer_id !== scope.customer_id) return stop;
  const answered = feedback.exists || invitation.status === 'submitted';
  if (scope.kind === 'thankYou') return { eligible: answered && settings.autoReplyEnabled, delay_minutes: 0 };
  if (answered || !settings.bookingAutomaticRequests || (scope.kind === 'reminder' && settings.bookingMaxReminders === 0)) return stop;
  if (!await readActiveQuestionsForBrand(scope.brand_id, 'booking', settings.language)) return stop;
  const delay = scope.kind === 'invitation' ? job.bookingDelayMinutes : job.reminderDelayMinutes;
  // Legacy booking jobs without a planned-end timing snapshot cannot send.
  if (!Number.isInteger(delay) || delay < (scope.kind === 'reminder' ? 1 : 0) || delay > 20160) return stop;
  return { eligible: true, delay_minutes: delay as number };
}
