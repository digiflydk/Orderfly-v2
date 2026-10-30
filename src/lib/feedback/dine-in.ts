import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { resolveActiveQuestionVersion } from './question-scope';
import { ESMERALDA_BOOKING_QUESTIONS, ESMERALDA_FEEDBACK_BRAND } from './esmeralda-booking-setup';
import type { ExperienceFeedbackQuestionsVersion, FeedbackSourceContext } from './source-types';

const id = z.string().regex(/^[\w-]{1,160}$/);
const tokenSchema = z.object({
  v: z.literal(1), nonce: z.string().regex(/^[a-f0-9]{64}$/),
  brandId: id, locationId: id, brandSlug: id, locationSlug: id,
  language: z.enum(['da', 'en']), questionVersionId: id,
  questionHash: z.string().regex(/^[a-f0-9]{64}$/), exp: z.number().int(),
}).strict();
export type DineInToken = z.infer<typeof tokenSchema>;
const lifetime = 30 * 60 * 1000;
function signature(value: string) {
  const secret = process.env.ORDERFLY_FEEDBACK_TOKEN_SECRET || '';
  if (secret.length < 32) throw new Error('Feedback signing is not configured.');
  return createHmac('sha256', secret).update('orderfly-dine-in-v1:' + value).digest();
}
export function signDineInToken(payload: DineInToken) {
  const encoded = Buffer.from(JSON.stringify(tokenSchema.parse(payload))).toString('base64url');
  return encoded + '.' + signature(encoded).toString('base64url');
}
export function readDineInToken(token: unknown, now = Date.now()): DineInToken | null {
  try {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const [encoded, supplied, extra] = token.split('.');
    if (!encoded || !supplied || extra !== undefined) return null;
    const expected = signature(encoded), actual = Buffer.from(supplied, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const data = tokenSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString()));
    return data.exp > now && data.exp <= now + lifetime ? data : null;
  } catch { return null; }
}
export function dineInQuestionHash(version: ExperienceFeedbackQuestionsVersion) {
  return createHash('sha256').update(JSON.stringify(version.questions)).digest('hex');
}
export function dineInRateKey(locationId: string, address?: string) {
  const bucket = address === undefined ? ['location', locationId] : ['address', locationId, address.slice(0, 200)];
  return signature('rate:' + JSON.stringify(bucket)).toString('hex');
}

/** Restaurant-specific brand questions win. A deliberately disabled form stays disabled. */
export function selectDineInQuestions(versions: ExperienceFeedbackQuestionsVersion[], brandId: string, language: string, selected?: string) {
  const scoped = versions.filter(v => v.scope === 'brand' && v.brandId === brandId && v.language === language && v.orderTypes?.includes('booking'));
  if (scoped.length) return resolveActiveQuestionVersion(scoped, brandId, 'booking', language, selected);
  if (brandId === ESMERALDA_FEEDBACK_BRAND && language === 'da') {
    return { ...ESMERALDA_BOOKING_QUESTIONS, id: 'esmeralda-dine-in-default-da-v1' } as ExperienceFeedbackQuestionsVersion;
  }
  return resolveActiveQuestionVersion(versions, brandId, 'booking', language, selected);
}

/** Read-only page load: never creates an invitation, customer, question or feedback record. */
export async function getDineInFeedbackContext(brandSlug: string, locationSlug: string, language = 'da') {
  if (!id.safeParse(brandSlug).success || !id.safeParse(locationSlug).success || !['da', 'en'].includes(language)) return null;
  const db = getAdminDb();
  const brands = await db.collection('brands').where('slug', '==', brandSlug).limit(2).get();
  if (brands.docs.length !== 1 || brands.docs[0].data().status !== 'active') return null;
  const brand = brands.docs[0], brandData = brand.data();
  const locations = await db.collection('locations').where('brandId', '==', brand.id).where('slug', '==', locationSlug).limit(2).get();
  if (locations.docs.length !== 1 || locations.docs[0].data().isActive === false) return null;
  const location = locations.docs[0];
  const [versions, settings] = await Promise.all([
    db.collection('feedbackQuestionsVersion').get(), db.collection('feedbackSettings').doc(brand.id).get(),
  ]);
  const questionsVersion = selectDineInQuestions(versions.docs.map(d => ({ ...d.data(), id: d.id }) as ExperienceFeedbackQuestionsVersion), brand.id, language, settings.data()?.questionVersionId);
  if (!questionsVersion) return null;
  const nonce = randomBytes(32).toString('hex');
  const token = signDineInToken({ v: 1, nonce, brandId: brand.id, locationId: location.id, brandSlug, locationSlug,
    language: language as 'da' | 'en', questionVersionId: questionsVersion.id, questionHash: dineInQuestionHash(questionsVersion), exp: Date.now() + lifetime });
  const context: FeedbackSourceContext = {
    sourceType: 'dine_in', sourceId: nonce, customerId: '', brandId: brand.id, locationId: location.id,
    brandName: String(brandData.name || ''), brandLogoUrl: typeof brandData.logoUrl === 'string' ? brandData.logoUrl : null,
    displayReference: String(location.data().name || ''), experienceType: 'booking', invitationToken: token,
  };
  // Restrict serialization to the actual question model, not Firestore metadata.
  return { context, questionsVersion: { id: questionsVersion.id, versionLabel: questionsVersion.versionLabel, isActive: true,
    scope: questionsVersion.scope, brandId: questionsVersion.brandId ?? null, language: questionsVersion.language,
    orderTypes: questionsVersion.orderTypes, questions: questionsVersion.questions } };
}
