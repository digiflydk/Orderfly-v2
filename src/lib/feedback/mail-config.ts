import 'server-only';
import { z } from 'zod';

const notificationConfigSchema = z.object({
  endpoint: z.string().url().refine(value => value.startsWith('https://')),
  organizationId: z.string().uuid(),
  secret: z.string().min(32).max(512),
}).strict();

export function notificationPlatformConfig() {
  try {
    const parsed = notificationConfigSchema.parse({
      endpoint: process.env.ORDERFLY_NOTIFICATION_ENDPOINT,
      organizationId: process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID,
      secret: process.env.ORDERFLY_NOTIFICATION_SECRET,
    });
    const endpoint = new URL(parsed.endpoint);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
    return { ...parsed, endpoint: endpoint.toString() };
  } catch { return null; }
}

export function feedbackMailConfig(_brandId: string) {
  const platform = notificationPlatformConfig();
  if (!platform || (process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET || '').length < 32) return null;
  return { platform };
}

export const feedbackAutomationSchema = z.object({
  emailEnabled: z.boolean().default(false), automaticRequests: z.boolean().default(false),
  delayHours: z.number().int().min(0).max(168).default(2),
  reminderAfterHours: z.number().int().min(24).max(336).default(24),
  maxReminders: z.number().int().min(0).max(1).default(0),
  autoReplyEnabled: z.boolean().default(false), language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default('da'),
  questionVersionId: z.string().regex(/^[\w-]{1,160}$/).nullable().default(null),
});
export type FeedbackAutomation = z.infer<typeof feedbackAutomationSchema>;
export function feedbackAutomation(data: unknown): FeedbackAutomation {
  const parsed = feedbackAutomationSchema.safeParse(data || {});
  return parsed.success ? parsed.data : feedbackAutomationSchema.parse({});
}
