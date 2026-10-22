'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { LoyaltyError } from '@/lib/loyalty/stamp-card/counter';
import { readClubCampaign, saveClubCampaign } from '@/lib/loyalty/stamp-card/campaign-admin';
import type { CampaignDoc } from '@/lib/loyalty/stamp-card/campaign-rules';

export type ClubCampaignResult = { ok: true; campaign: CampaignDoc } | { ok: false; error: string };
async function actor() { const session = await orderflySession(); return { identity: session.identity, name: session.name }; }
function failure(error: unknown): ClubCampaignResult {
  if (error instanceof LoyaltyError) return { ok: false, error: error.code };
  if (error instanceof AuthorityError) return { ok: false, error: error.status === 401 ? 'unauthorized' : 'forbidden' };
  return { ok: false, error: 'unavailable' };
}
export async function loadClubCampaignAction(brandId: string): Promise<ClubCampaignResult> {
  try { return { ok: true, campaign: await readClubCampaign(getAdminDb(), await actor(), brandId) }; }
  catch (error) { return failure(error); }
}
export async function saveClubCampaignAction(input: unknown): Promise<ClubCampaignResult> {
  try {
    const campaign = await saveClubCampaign(getAdminDb(), await actor(), input, Date.now());
    revalidatePath('/superadmin/discounts');
    return { ok: true, campaign };
  } catch (error) { return failure(error); }
}
