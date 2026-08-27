import { z } from 'zod';

export const esmeraldaBookingFeedbackInvitationSchema = z.object({
  organization_id: z.string().trim().min(1).max(200),
  location_id: z.string().trim().min(1).max(200),
  booking_id: z.string().trim().min(1).max(200),
  customer_id: z.string().trim().min(1).max(200),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  starts_at: z.string().datetime({ offset: true }).optional().nullable(),
});

export const esmeraldaCustomerHistorySchema = z.object({
  organization_id: z.string().trim().min(1).max(200),
  customer_id: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export type EsmeraldaBookingFeedbackInvitationInput = z.infer<
  typeof esmeraldaBookingFeedbackInvitationSchema
>;

export type EsmeraldaCustomerHistoryInput = z.infer<
  typeof esmeraldaCustomerHistorySchema
>;
