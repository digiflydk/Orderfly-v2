import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { admin, getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { notificationPlatformConfig } from '@/lib/feedback/mail-config';

// This integration currently serves Esmeralda only. Adding a brand requires an
// explicit server-side binding, never a browser-supplied tenant identifier.
export const ESMERALDA_MAIL_SCOPE = {
  organization_id: 'aaa94d25-3ca6-4ebf-a673-164608db6c55',
  brand_id: 'oeypKaMyYcQjIwaa1PtV',
} as const;
export const mailStatusInput = z.object({
  organization_id: z.literal(ESMERALDA_MAIL_SCOPE.organization_id),
  brand_id: z.literal(ESMERALDA_MAIL_SCOPE.brand_id),
  order_id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
}).strict();

const states = ['pending', 'preparing', 'dispatching', 'accepted', 'suppressed', 'uncertain', 'failed'];
const errors = new Set(['notification_configuration_required', 'provider_result_unknown', 'provider_preflight_failed', 'provider_rate_limited', 'order_not_eligible']);
export function safeMailError(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && (errors.has(value) || /^provider_rejected_[45]\d{2}$/.test(value))) return value;
  return 'unknown_error';
}
function date(value: unknown): string | null {
  const ms = typeof value === 'number' ? value : value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function' ? value.toMillis() : NaN;
  return Number.isFinite(ms) && ms >= 0 && ms < 8640000000000000 ? new Date(ms).toISOString() : null;
}

export async function readOrderMailStatus(input: z.infer<typeof mailStatusInput>) {
  const scope = mailStatusInput.parse(input);
  if (process.env.ORDERFLY_NOTIFICATION_ORGANIZATION_ID !== scope.organization_id) {
    return { error: 'organization_configuration_mismatch' } as const;
  }
  const db = getAdminDb();
  // The admin credential must address the production DATA project.
  if (getAdminApp().options.projectId !== 'orderfly-39325') return { error: 'data_project_mismatch' } as const;
  const orderResult = await db.collection('orders')
    .where('brandId', '==', scope.brand_id)
    .where(admin.firestore.FieldPath.documentId(), '==', scope.order_id).limit(1).get();
  const order = orderResult.docs[0]?.data();
  if (!order) return { error: 'order_not_found' } as const;
  const jobId = createHash('sha256').update(JSON.stringify(['order-confirmation', scope.brand_id, scope.order_id])).digest('hex');
  const jobResult = await db.collection('orderNotificationJobs')
    .where('brandId', '==', scope.brand_id)
    .where(admin.firestore.FieldPath.documentId(), '==', jobId).limit(1).get();
  const job = jobResult.docs[0]?.data();
  if (job && (job.orderId !== scope.order_id || job.locationId !== order.locationId || job.brandId !== scope.brand_id)) {
    return { error: 'job_scope_mismatch' } as const;
  }
  const eligibility = order.paymentStatus !== 'Paid' ? 'unpaid' : order.status === 'Canceled' ? 'canceled' :
    typeof order.customerContact !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.customerContact.trim()) ? 'invalid_email' : 'eligible';
  return {
    version: 1, order_id: scope.order_id,
    payment_status: ['Paid', 'Pending', 'Failed', 'Refunded'].includes(order.paymentStatus) ? order.paymentStatus : 'unknown',
    eligibility,
    configuration: { notification_ready: notificationPlatformConfig() !== null },
    job: job ? {
      state: states.includes(job.state) ? job.state : 'unknown',
      attempts: Number.isSafeInteger(job.attempts) && job.attempts >= 0 ? job.attempts : 0,
      last_error: safeMailError(job.lastError),
      updated_at: date(job.updatedAt), next_attempt_at: date(job.nextAttemptAt),
    } : null,
  };
}
