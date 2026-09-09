import 'server-only';
import { z } from 'zod';
import { marketingConfig } from '@/lib/marketing/config';

const eventMap = z.object({ brandId: z.string().min(1), enabled: z.boolean(), invitation: z.string().min(1).max(100), reminder: z.string().min(1).max(100), thankYou: z.string().min(1).max(100) }).strict();
export function feedbackMailConfig(brandId: string) {
  try {
    const mappings = z.array(eventMap).max(100).parse(JSON.parse(process.env.ORDERFLY_FEEDBACK_EVENTS || '[]'));
    if (new Set(mappings.map(m => m.brandId)).size !== mappings.length) return null;
    const events = mappings.find(m => m.brandId === brandId && m.enabled);
    const provider = marketingConfig(brandId);
    if (!events || !provider || (process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET || '').length < 32) return null;
    return { events, provider };
  } catch { return null; }
}

export const feedbackAutomationSchema = z.object({
  emailEnabled: z.boolean().default(false), automaticRequests: z.boolean().default(false),
  delayHours: z.number().int().min(0).max(168).default(2),
  reminderAfterHours: z.number().int().min(24).max(336).default(72),
  maxReminders: z.number().int().min(0).max(1).default(0),
  autoReplyEnabled: z.boolean().default(false), language: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/).default('da'),
});
export type FeedbackAutomation = z.infer<typeof feedbackAutomationSchema>;
export function feedbackAutomation(data: unknown): FeedbackAutomation {
  const parsed = feedbackAutomationSchema.safeParse(data || {});
  return parsed.success ? parsed.data : feedbackAutomationSchema.parse({});
}
