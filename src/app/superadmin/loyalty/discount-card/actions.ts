'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { readDiscountCardAdmin, saveDiscountCardFeature, saveDiscountCardGroup, saveDiscountCardAssignment } from '@/lib/loyalty/discount-card/admin';
import { inviteDiscountCard } from '@/lib/loyalty/discount-card/invitations';

const customerQuerySchema = z.union([z.literal(''), z.string().trim().email().max(254)]);
const messages = new Set(['record_changed', 'invalid_settings', 'invalid_input', 'invalid_group', 'invalid_assignment', 'forbidden', 'unauthorized', 'mail_configuration_required', 'customer_not_found', 'group_inactive', 'feature_inactive', 'invalid_location']);
function failure(error: unknown) {
  const code = error instanceof z.ZodError ? 'invalid_input' : error instanceof AuthorityError ? error.code : error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unavailable';
  return { ok: false as const, error: messages.has(code) ? code : 'unavailable' };
}

export async function searchDiscountCardCustomersAction(brandId: string, email: string) {
  try {
    const session = await requirePlatformSuperuser();
    if (typeof email !== 'string' || email.length > 254) return { ok: false as const, error: 'invalid_input' };
    return { ok: true as const, data: await readDiscountCardAdmin(getAdminDb(), { identity: session.identity, name: session.name }, brandId, email.trim()) };
  } catch (error) { return failure(error); }
}

export async function saveDiscountCardFeatureAction(input: Parameters<typeof saveDiscountCardFeature>[2], customerQuery = '') {
  try {
    const session = await requirePlatformSuperuser(), db = getAdminDb(), actor = { identity: session.identity, name: session.name };
    customerQuery = customerQuerySchema.parse(customerQuery);
    await saveDiscountCardFeature(db, actor, input, Date.now());
    revalidatePath('/superadmin/loyalty/discount-card');
    return { ok: true as const, data: await readDiscountCardAdmin(db, actor, input.brandId, customerQuery) };
  } catch (error) { return failure(error); }
}

export async function saveDiscountCardGroupAction(input: Parameters<typeof saveDiscountCardGroup>[2], customerQuery = '') {
  try {
    const session = await requirePlatformSuperuser(), db = getAdminDb(), actor = { identity: session.identity, name: session.name };
    customerQuery = customerQuerySchema.parse(customerQuery);
    await saveDiscountCardGroup(db, actor, input, Date.now());
    revalidatePath('/superadmin/loyalty/discount-card');
    return { ok: true as const, data: await readDiscountCardAdmin(db, actor, input.brandId, customerQuery) };
  } catch (error) { return failure(error); }
}

export async function saveDiscountCardAssignmentAction(input: Parameters<typeof saveDiscountCardAssignment>[2], customerQuery = '') {
  try {
    const session = await requirePlatformSuperuser(), db = getAdminDb(), actor = { identity: session.identity, name: session.name };
    customerQuery = customerQuerySchema.parse(customerQuery);
    await saveDiscountCardAssignment(db, actor, input, Date.now());
    revalidatePath('/superadmin/loyalty/discount-card');
    return { ok: true as const, data: await readDiscountCardAdmin(db, actor, input.brandId, customerQuery) };
  } catch (error) { return failure(error); }
}

export async function inviteDiscountCardAction(input: Parameters<typeof inviteDiscountCard>[2], customerQuery = '') {
  try {
    const session = await requirePlatformSuperuser(), db = getAdminDb(), actor = { identity: session.identity, name: session.name };
    customerQuery = customerQuerySchema.parse(customerQuery);
    await inviteDiscountCard(db, actor, input, Date.now());
    return { ok: true as const, data: await readDiscountCardAdmin(db, actor, input.brandId, customerQuery) };
  } catch (error) { return failure(error); }
}
