import 'server-only';
import { z } from 'zod';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { assertFeedbackBrand, requireFeedbackAccess } from './access';
import { feedbackAutomation, feedbackAutomationSchema, feedbackMailConfig } from './mail-config';
import { FeedbackQuestionsVersionSchema } from '@/lib/schemas/feedback';
const settingsUpdate = z.object({ brandId: z.string().regex(/^[\w-]{1,160}$/), publicReviewsEnabled: z.boolean().optional() }).merge(feedbackAutomationSchema.partial()).strict().refine(data => Object.entries(data).some(([key, value]) => key !== 'brandId' && value !== undefined), 'Vælg mindst én indstilling.');
export type FeedbackSettingsUpdate = z.infer<typeof settingsUpdate>;

export async function readFeedbackSettings(brandId: string) {
  assertFeedbackBrand(await requireFeedbackAccess(), brandId);
  const data = (await getAdminDb().collection('feedbackSettings').doc(brandId).get()).data();
  return { publicReviewsEnabled: data?.publicReviewsEnabled === true, ...feedbackAutomation(data), emailConfigured: Boolean(feedbackMailConfig(brandId)) };
}
export async function writeFeedbackSettings(input: unknown) {
  const data = settingsUpdate.parse(input);
  const access = await requireFeedbackAccess('feedback:edit');
  assertFeedbackBrand(access, data.brandId);
  if (data.emailEnabled === true && !feedbackMailConfig(data.brandId)) throw new Error('Mailopsætningen for dette brand er ikke klar.');
  const db = getAdminDb();
  await db.runTransaction(async tx => {
    const [brand, current] = await Promise.all([
      tx.get(db.collection('brands').doc(data.brandId)),
      tx.get(db.collection('feedbackSettings').doc(data.brandId)),
    ]);
    if (!brand.exists) throw new Error('Brandet findes ikke.');
    if (data.questionVersionId) {
      const version = await tx.get(db.collection('feedbackQuestionsVersion').doc(data.questionVersionId));
      const parsed = FeedbackQuestionsVersionSchema.safeParse(version.data());
      const language = data.language ?? feedbackAutomation(current.data()).language;
      if (!version.exists || !parsed.success || !parsed.data.isActive || parsed.data.language !== language) throw new Error('Vælg et aktivt feedbackskema på det valgte sprog.');
    }
    const { brandId, ...settings } = data;
    tx.set(db.collection('feedbackSettings').doc(data.brandId), { ...Object.fromEntries(Object.entries(settings).filter(([,value]) => value !== undefined)), updatedAt: getAdminFieldValue().serverTimestamp(), updatedBy: access.uid }, { merge: true });
  });
}
