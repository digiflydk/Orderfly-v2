import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { dullyEligible, dullyHash } from './dully-contract';
import { feedbackAutomation, feedbackMailConfig } from './mail-config';
import { resolveActiveQuestionVersion } from './question-scope';
import type { ExperienceFeedbackQuestionsVersion } from './source-types';
export type DullySource = {
  id: string; brandId: string; locationId: string; scopeId: string; customerId: string; sourceType: 'dully_order';
  email: string; experienceType: 'pickup' | 'delivery'; language: string; orderNumber: string;
  status: string; paymentStatus: string; orderedAt: string; completedAt: string | null;
  invitationStatus: 'active' | 'submitted'; expiresAt: number; isTest: boolean; fingerprint: string;
  mailState: string; attempts: number; eventId: string; dueAt: number; updatedAt: number; lastVerifiedAt: number;
};
function signature(payload: string) {
  const secret = process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET || '';
  if (secret.length < 32) throw new Error('Feedbacksignering er ikke konfigureret.');
  return createHmac('sha256', secret).update('orderfly-dully-feedback-v1:' + payload).digest('base64url');
}
export function signDullyInvitation(id: string, expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ v: 1, id, exp: expiresAt })).toString('base64url');
  return payload + '.' + signature(payload);
}
export function verifyDullyToken(token: string, now = Date.now()): { id: string; exp: number } | null {
  try {
    if (token.length > 4096) return null;
    const parts = token.split('.'); if (parts.length !== 2) return null;
    const expected = Buffer.from(signature(parts[0])), actual = Buffer.from(parts[1]);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    return value.v === 1 && /^[a-f0-9]{64}$/.test(value.id) && Number.isFinite(value.exp) && value.exp > now ? value : null;
  } catch { return null; }
}
export async function resolveDullyInvitation(token: string) {
  const verified = verifyDullyToken(token); if (!verified) return null;
  const db = getAdminDb(), source = (await db.collection('dullyFeedbackSources').doc(verified.id).get()).data() as DullySource | undefined;
  if (!source || source.id !== verified.id || source.sourceType !== 'dully_order' || source.expiresAt !== verified.exp || !['active', 'submitted'].includes(source.invitationStatus) || !dullyEligible(source)) return null;
  const [brand, location] = await Promise.all([db.collection('brands').doc(source.brandId).get(), db.collection('locations').doc(source.locationId).get()]);
  if (brand.data()?.status !== 'active' || location.data()?.brandId !== source.brandId || location.data()?.isActive === false) return null;
  return { ...source, brandName: String(brand.data()?.name || ''), brandLogoUrl: typeof brand.data()?.logoUrl === 'string' ? brand.data()!.logoUrl as string : null };
}
export async function dullyFingerprint(brandId: string, locationId: string, config: { accountId: string; restaurantId: string }, tx?: FirebaseFirestore.Transaction) {
  const db = getAdminDb();
  const read = <T extends FirebaseFirestore.DocumentData>(ref: FirebaseFirestore.DocumentReference<T>) => tx ? tx.get(ref) : ref.get();
  await read(db.collection('feedbackConfiguration').doc('versionLock'));
  const settings = feedbackAutomation((await read(db.collection('feedbackSettings').doc(brandId))).data());
  const query = db.collection('feedbackQuestionsVersion').where('isActive', '==', true);
  const docs = await (tx ? tx.get(query) : query.get());
  const versions = docs.docs.map(d => ({ ...d.data(), id: d.id }) as ExperienceFeedbackQuestionsVersion);
  const forms = ['pickup', 'delivery'].map(type => resolveActiveQuestionVersion(versions, brandId, type as 'pickup' | 'delivery', settings.language, settings.questionVersionId));
  const mail = feedbackMailConfig(brandId);
  if (!mail || forms.some(f => !f)) throw new Error('Kontrollér mailopsætning og aktive afhentnings- og leveringsskemaer.');
  return { language: settings.language, emailEnabled: settings.emailEnabled, fingerprint: dullyHash([brandId, locationId, config.accountId, config.restaurantId, settings.language,
    forms.map(f => [f!.id, f!.questions]), mail.platform.endpoint, mail.platform.organizationId]) };
}
