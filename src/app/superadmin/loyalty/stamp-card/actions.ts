'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { orderflySession } from '@/lib/access/orderfly-session';
import { correctMember, correctionSchema, LoyaltyError } from '@/lib/loyalty/stamp-card/counter';
import { listEvents, listMembers, logFilterSchema, saveSettings, saveSettingsSchema } from '@/lib/loyalty/stamp-card/admin';
import type { ZodIssue } from 'zod';

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; fields?: Record<string, string> };

function danishIssue(issue: ZodIssue) {
  if (issue.message === 'Required when the program is active') return 'Skal udfyldes, når programmet er aktivt.';
  if (issue.message === 'Choose a product or category') return 'Vælg mindst ét produkt eller én kategori.';
  if (issue.code === 'too_small') return 'Værdien er for lille.';
  if (issue.code === 'too_big') return 'Værdien er for stor.';
  return 'Ugyldig værdi.';
}
async function actor() {
  const session = await orderflySession();
  return { identity: session.identity, name: session.name };
}
function failure(error: unknown): ActionResult<never> {
  if (error instanceof LoyaltyError) return { ok: false, error: error.code };
  if (error instanceof AuthorityError) return { ok: false, error: error.status === 401 ? 'unauthorized' : 'forbidden' };
  return { ok: false, error: 'unavailable' };
}

export async function saveProgramSettings(input: unknown): Promise<ActionResult<{ version: number; changed: number }>> {
  const parsed = saveSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path.at(issue.path[0] === 'settings' ? 1 : 0) ?? 'form')] ??= danishIssue(issue);
    return { ok: false, error: 'invalid_settings', fields };
  }
  try {
    const data = await saveSettings(getAdminDb(), await actor(), parsed.data, Date.now());
    revalidatePath('/superadmin/loyalty/stamp-card');
    return { ok: true, data };
  } catch (error) { return failure(error); }
}


export async function exportMembers(brandIds: string[]): Promise<ActionResult<Awaited<ReturnType<typeof listMembers>>>> {
  try { return { ok: true, data: await listMembers(getAdminDb(), await actor(), brandIds.slice(0, 50), Date.now()) }; }
  catch (error) { return failure(error); }
}

export async function exportEvents(filter: unknown): Promise<ActionResult<Awaited<ReturnType<typeof listEvents>>>> {
  const parsed = logFilterSchema.safeParse(filter);
  if (!parsed.success) return { ok: false, error: 'invalid_filter' };
  try { return { ok: true, data: await listEvents(getAdminDb(), await actor(), parsed.data) }; }
  catch (error) { return failure(error); }
}

// The same transactional, idempotent correction as the counter API, checked for the chosen location.
export async function correctMemberAction(input: unknown): Promise<ActionResult<Record<string, unknown>>> {
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_correction' };
  try {
    const data = await correctMember(getAdminDb(), await actor(), parsed.data, Date.now());
    revalidatePath('/superadmin/loyalty/stamp-card');
    return { ok: true, data: data as Record<string, unknown> };
  } catch (error) { return failure(error); }
}
