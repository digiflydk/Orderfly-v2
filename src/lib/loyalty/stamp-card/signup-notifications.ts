import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { AuthorityError, principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { NotificationPlatformClient, NotificationPlatformError } from '@/lib/notifications/platform';
import { loyaltyMailConfig } from './mail';
import { COLLECTIONS, hashKey } from './model';
import { saveSignupNotificationsSchema, signupNotificationSettings } from './signup-notification-rules';

export const SIGNUP_NOTIFICATIONS = { settings: 'loyaltySignupNotificationSettings', outbox: 'loyaltySignupNotificationOutbox', audit: 'loyaltySignupNotificationAudit' } as const;
const NEVER = Number.MAX_SAFE_INTEGER;
type Actor = { identity: VerifiedIdentity; name: string };

async function requireSuperuserBrand(db: Firestore, tx: Transaction, identity: VerifiedIdentity, brandId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(brandId)) throw new AuthorityError('invalid_identifier', 400);
  const policy = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
  if (!policy.success || !isSuperuser(policy.data, principalKey(identity)) ||
    !policy.data.companies.some(company => company.active && company.orderflyBrandIds.includes(brandId)) ||
    !(await tx.get(db.collection('brands').doc(brandId))).exists) throw new AuthorityError('forbidden');
}

export async function readSignupNotifications(db: Firestore, actor: Actor, brandId: string) {
  return db.runTransaction(async tx => {
    await requireSuperuserBrand(db, tx, actor.identity, brandId);
    const saved = (await tx.get(db.collection(SIGNUP_NOTIFICATIONS.settings).doc(brandId))).data();
    return { ...signupNotificationSettings(saved, brandId), mailConfigured: Boolean(loyaltyMailConfig(brandId)) };
  });
}

export async function saveSignupNotifications(db: Firestore, actor: Actor, input: z.infer<typeof saveSignupNotificationsSchema>, now: number) {
  const parsed = saveSignupNotificationsSchema.parse(input);
  return db.runTransaction(async tx => {
    await requireSuperuserBrand(db, tx, actor.identity, parsed.brandId);
    const ref = db.collection(SIGNUP_NOTIFICATIONS.settings).doc(parsed.brandId);
    const current = signupNotificationSettings((await tx.get(ref)).data(), parsed.brandId);
    if (current.version !== parsed.version) throw new AuthorityError('record_changed', 409);
    if (parsed.settings.enabled && !loyaltyMailConfig(parsed.brandId)) throw new AuthorityError('mail_configuration_required', 409);
    if (JSON.stringify(current.settings) === JSON.stringify(parsed.settings)) return { ...current, changed: false };
    const version = current.version + 1, actorId = principalKey(actor.identity);
    tx.set(ref, { brandId: parsed.brandId, version, settings: parsed.settings, updatedAt: now, updatedBy: actorId, updatedByName: actor.name });
    tx.create(db.collection(SIGNUP_NOTIFICATIONS.audit).doc(hashKey('signup-notification-settings', parsed.brandId, String(version))), {
      brandId: parsed.brandId, version, before: current.settings, after: parsed.settings, actorId, actorName: actor.name, createdAt: now,
    });
    return { version, settings: parsed.settings, changed: true };
  });
}

// Called only by the new-membership branch, before any transaction writes.
// The resulting outbox and member commit atomically; existing-member login is excluded.
export async function stageSignupNotification(db: Firestore, tx: Transaction, source: {
  brandId: string; memberId: string; programName: string; joinedAt: number;
}) {
  const settings = signupNotificationSettings((await tx.get(db.collection(SIGNUP_NOTIFICATIONS.settings).doc(source.brandId))).data(), source.brandId);
  if (!settings.settings.enabled || !settings.settings.recipientEmail) return { apply() {} };
  const id = hashKey('member-joined-notification', source.brandId, source.memberId);
  return { apply() {
    tx.create(db.collection(SIGNUP_NOTIFICATIONS.outbox).doc(id), { ...source, settingsVersion: settings.version,
      recipientEmail: settings.settings.recipientEmail, state: 'pending', attempts: 0, nextAttemptAt: source.joinedAt, createdAt: source.joinedAt });
  } };
}

const jobSchema = z.object({
  brandId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), memberId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  programName: z.string().min(1).max(80), joinedAt: z.number().int().nonnegative().max(8.64e15),
  settingsVersion: z.number().int().positive(), recipientEmail: z.string().email(), attempts: z.number().int().nonnegative(),
  state: z.enum(['pending', 'failed', 'dispatching', 'accepted', 'cancelled', 'uncertain']), nextAttemptAt: z.number(),
});

export async function deliverSignupNotification(db: Firestore, id: string, now = Date.now(), client = new NotificationPlatformClient()) {
  const ref = db.collection(SIGNUP_NOTIFICATIONS.outbox).doc(id), lease = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const parsed = jobSchema.safeParse((await tx.get(ref)).data());
    if (!parsed.success || !['pending', 'failed'].includes(parsed.data.state) || parsed.data.nextAttemptAt > now) return null;
    const job = parsed.data;
    const [settingsDoc, memberDoc, brandDoc, policyDoc] = await Promise.all([
      tx.get(db.collection(SIGNUP_NOTIFICATIONS.settings).doc(job.brandId)),
      tx.get(db.collection(COLLECTIONS.members).doc(job.memberId)), tx.get(db.collection('brands').doc(job.brandId)),
      tx.get(db.collection('platformAdminControl').doc('access-v1')),
    ]);
    const settings = signupNotificationSettings(settingsDoc.data(), job.brandId), member = memberDoc.data(), brand = brandDoc.data();
    const policy = policySchema.safeParse(policyDoc.data());
    const company = policy.success ? policy.data.companies.find(c => c.active && c.orderflyBrandIds.includes(job.brandId)) : null;
    if (!settings.settings.enabled || settings.version !== job.settingsVersion || settings.settings.recipientEmail !== job.recipientEmail ||
      !member || member.brandId !== job.brandId || member.status !== 'active' || member.joinedAt !== job.joinedAt ||
      !brand || brand.status === 'suspended' || !company || company.id !== member.companyId || id !== hashKey('member-joined-notification', job.brandId, job.memberId)) {
      tx.update(ref, { state: 'cancelled', nextAttemptAt: NEVER, updatedAt: now }); return null;
    }
    const config = loyaltyMailConfig(job.brandId);
    if (!config) { tx.update(ref, { lastError: 'mail_configuration_required', nextAttemptAt: now + 60_000, updatedAt: now }); return null; }
    tx.update(ref, { state: 'dispatching', lease, nextAttemptAt: NEVER, updatedAt: now });
    return { job, config, brandName: String(brand.name || job.brandId) };
  });
  if (!claimed) return null;
  const { job, config, brandName } = claimed;
  let update: Record<string, unknown>;
  try {
    await client.send({ idempotencyKey: `loyalty-member-joined-${id}`, templateKey: 'orderfly.stamp_card.member_joined',
      organizationId: config.organizationId, senderProfile: config.senderProfile, locale: 'da', recipientEmail: job.recipientEmail,
      relatedEntity: { type: 'loyalty_member', id: job.memberId }, variables: {
        brand_id: job.brandId, brand_name: brandName, program_name: job.programName, member_id: job.memberId,
        joined_at: new Date(job.joinedAt).toISOString(), admin_url: `https://orderfly.dk/superadmin/loyalty/stamp-card/members/${job.memberId}`,
      } });
    update = { state: 'accepted', acceptedAt: now, lastError: null };
  } catch (error) {
    const failure = error instanceof NotificationPlatformError ? error : new NotificationPlatformError('provider_result_unknown', true);
    const attempts = job.attempts + 1;
    update = failure.uncertain ? { state: 'uncertain', attempts, lastError: failure.code }
      : { state: 'failed', attempts, lastError: failure.code, nextAttemptAt: failure.retryable && attempts < 5 ? now + 30_000 * attempts : NEVER };
  }
  await db.runTransaction(async tx => {
    if ((await tx.get(ref)).data()?.lease !== lease) return;
    tx.update(ref, { ...update, lease: null, updatedAt: Date.now() });
  });
  return String(update.state);
}

export async function runSignupNotificationOutbox(db: Firestore, now = Date.now(), deadline = Date.now() + 20_000) {
  const counts: Record<string, number> = {};
  const jobs = await db.collection(SIGNUP_NOTIFICATIONS.outbox).where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt').limit(20).get();
  for (const doc of jobs.docs) {
    if (Date.now() > deadline) break;
    const state = await deliverSignupNotification(db, doc.id, now);
    if (state) counts[state] = (counts[state] || 0) + 1;
  }
  return counts;
}
