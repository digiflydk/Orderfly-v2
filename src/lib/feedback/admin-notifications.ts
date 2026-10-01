import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { notificationPlatformConfig } from './mail-config';

export const feedbackAdminNotificationSchema = z.object({
  adminNotificationsEnabled: z.boolean().default(false),
  adminNotificationEmail: z.string().trim().email().max(320).transform(email => email.toLowerCase()).nullable().default(null),
});
const bindingSchema = z.object({ organizationId: z.string().uuid(), email: z.string().trim().email().max(320) }).strict();
function binding(brandId: string) {
  try { return bindingSchema.parse(JSON.parse(process.env.ORDERFLY_FEEDBACK_ADMIN_NOTIFICATIONS || '{}')[brandId]); }
  catch { return null; }
}
export function feedbackAdminNotificationConfig(brandId: string) {
  const platform = notificationPlatformConfig(), configured = binding(brandId);
  return platform && configured ? { platform: { ...platform, organizationId: configured.organizationId }, recipientEmail: configured.email.toLowerCase() } : null;
}
export function feedbackAdminNotifications(brandId: string, data: unknown) {
  const defaults = binding(brandId);
  const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const parsed = feedbackAdminNotificationSchema.safeParse({
    adminNotificationsEnabled: row.adminNotificationsEnabled ?? Boolean(defaults),
    adminNotificationEmail: row.adminNotificationEmail === undefined ? defaults?.email ?? null : row.adminNotificationEmail,
  });
  return parsed.success ? parsed.data : feedbackAdminNotificationSchema.parse({});
}
export type FeedbackAdminNotificationSource = {
  feedbackId: string; brandId: string; locationId: string;
  sourceType: 'commerce_order' | 'booking'; sourceId: string; recipientEmail: string;
};
export function pendingFeedbackAdminNotification(source: FeedbackAdminNotificationSource) {
  const now = Date.now();
  return { ...source, kind: 'adminNotification' as const, state: 'pending', eventId: randomUUID(),
    nextAttemptAt: now, attempts: 0, createdAt: now, updatedAt: now };
}
