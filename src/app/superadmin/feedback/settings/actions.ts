'use server';
import { writeFeedbackSettings, type FeedbackSettingsUpdate } from '@/lib/feedback/settings';
import { retryFeedbackMailJob } from '@/lib/feedback/mail-admin';
import { revalidatePath } from 'next/cache';
export async function saveFeedbackSettings(input: FeedbackSettingsUpdate) {
  try {
    await writeFeedbackSettings(input);
    try { revalidatePath('/superadmin/feedback/settings'); } catch {}
    return { ok: true, message: 'Indstillingerne er gemt.' };
  } catch { return { ok: false, message: 'Kunne ikke gemme. Kontrollér din adgang og prøv igen. Dine valg er bevaret.' }; }
}
export async function retryFeedbackMail(id: string, providerNotAccepted: boolean) {
  try { await retryFeedbackMailJob(id, providerNotAccepted); try { revalidatePath('/superadmin/feedback/settings'); } catch {} return { ok: true, message: 'Beskeden er lagt tilbage i køen.' }; }
  catch { return { ok: false, message: 'Kunne ikke genstarte beskeden. Kontrollér status og din adgang.' }; }
}
