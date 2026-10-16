import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { notificationPlatformConfig } from '@/lib/feedback/mail-config';
import { NotificationPlatformClient, NotificationPlatformError } from '@/lib/notifications/platform';
import { COLLECTIONS } from './model';

const NEVER = Number.MAX_SAFE_INTEGER;
const brandMail = z.record(z.string(), z.object({ organizationId: z.string().uuid(), senderProfile: z.string().regex(/^[a-z0-9_-]{1,80}$/) }).strict());

// Operator-managed brand → central notification tenant/sender mapping. A
// loyalty-specific mapping wins; otherwise the brand's existing Orderfly mail
// mapping (also used by game prize mail) applies. No merchant input is used.
export function loyaltyMailConfig(brandId: string) {
  if (!notificationPlatformConfig()) return null;
  for (const name of ['ORDERFLY_LOYALTY_NOTIFICATION_BRANDS', 'ORDERFLY_GAMES_NOTIFICATION_BRANDS']) {
    try { const entry = brandMail.parse(JSON.parse(process.env[name] || '{}'))[brandId]; if (entry) return entry; } catch { /* next */ }
  }
  return null;
}

type Job = { brandId: string; memberId: string; email: string; name: string; brandName: string; programName: string; loginUrl: string | null;
  state: string; attempts: number; expiresAt: number };

// Sends one login mail. The job holds the link only until it is accepted or
// the link has expired; an expired link is never sent. A transport result that
// is unknown is not retried, so a member never receives two working links from one request.
export async function deliverLoyaltyMail(db: Firestore, id: string, now = Date.now(), client = new NotificationPlatformClient()) {
  const ref = db.collection(COLLECTIONS.mailOutbox).doc(id), lease = randomUUID();
  const job = await db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data() as Job | undefined;
    if (!data || !['pending', 'failed'].includes(data.state)) return null;
    if (data.expiresAt <= now) { tx.update(ref, { state: 'expired', loginUrl: null, nextAttemptAt: NEVER, updatedAt: now }); return null; }
    tx.update(ref, { state: 'dispatching', lease, nextAttemptAt: NEVER, updatedAt: now });
    return data;
  });
  if (!job || !job.loginUrl) return null;
  const mail = loyaltyMailConfig(job.brandId);
  let update: Record<string, unknown>;
  if (!mail) update = { state: 'pending', lastError: 'configuration_required', nextAttemptAt: now + 60_000 };
  else {
    try {
      await client.send({ idempotencyKey: `loyalty-login-${id}`, templateKey: 'orderfly.stamp_card.login_link', organizationId: mail.organizationId,
        senderProfile: mail.senderProfile, locale: 'da', recipientEmail: job.email, recipientName: job.name, relatedEntity: { type: 'loyalty_login', id },
        variables: { brand_id: job.brandId, brand_name: job.brandName, program_name: job.programName, name: job.name, login_url: job.loginUrl } });
      update = { state: 'accepted', loginUrl: null, lastError: null, acceptedAt: Date.now() };
    } catch (error) {
      const failure = error instanceof NotificationPlatformError ? error : new NotificationPlatformError('provider_result_unknown', true);
      const attempts = job.attempts + 1;
      update = failure.uncertain ? { state: 'uncertain', loginUrl: null, lastError: failure.code }
        : { state: 'failed', attempts, lastError: failure.code, nextAttemptAt: failure.retryable && attempts < 5 ? now + 30_000 * attempts : NEVER,
          ...(failure.retryable && attempts < 5 ? {} : { loginUrl: null }) };
    }
  }
  await db.runTransaction(async tx => {
    if ((await tx.get(ref)).data()?.lease !== lease) return;
    tx.update(ref, { ...update, lease: null, updatedAt: Date.now() });
  });
  return update.state as string;
}

// Retries waiting login mails from the existing worker heartbeat.
export async function runLoyaltyMailOutbox(db: Firestore, now = Date.now(), deadline = Date.now() + 20_000) {
  const counts: Record<string, number> = {};
  const jobs = await db.collection(COLLECTIONS.mailOutbox).where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt').limit(20).get();
  for (const doc of jobs.docs) {
    if (Date.now() > deadline) break;
    const state = await deliverLoyaltyMail(db, doc.id, now);
    if (state) counts[state] = (counts[state] || 0) + 1;
  }
  return counts;
}
