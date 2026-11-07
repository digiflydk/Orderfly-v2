import type { KdsSettings } from '@/lib/orders/kds-settings';
/** Held originals retain their deterministic identity and are never dispatched early.
 * A settings change grants a fresh five-minute collection window, not a reprint. */
export function originalAvailableAt(job: { createdAt: number; scheduledFulfillmentAt?: number }, settings: KdsSettings, changedAt = 0): number {
  if (job.scheduledFulfillmentAt === undefined) return job.createdAt;
  return Math.max(job.createdAt, job.scheduledFulfillmentAt - settings.preorderMinutes * 60_000, changedAt);
}
