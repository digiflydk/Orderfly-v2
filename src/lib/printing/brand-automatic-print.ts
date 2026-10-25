import 'server-only';
import { randomBytes } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { automaticPrintScopeSchema, automaticPrintCommandSchema, storedBrandAutomaticPrintSchema, projectBrandAutomaticPrint, AutomaticPrintError } from './brand-automatic-print-schema';

export async function readBrandAutomaticPrintPolicy(context: NativeTransactionContext, brandId: string) {
  if (context.db !== getAdminDb() || !context.transaction || !automaticPrintScopeSchema.safeParse({ brandId }).success) throw new AutomaticPrintError('automatic_print_invalid', 400);
  const saved = await context.transaction.get(context.db.collection('brands').doc(brandId).collection('printSettings').doc('automatic'));
  if (!saved.exists) return null;
  const parsed = storedBrandAutomaticPrintSchema.safeParse(saved.data());
  if (!parsed.success || saved.id !== 'automatic' || parsed.data.brandId !== brandId || parsed.data.updatedAt > Date.now()) throw new AutomaticPrintError('automatic_print_unavailable');
  return parsed.data;
}
export async function controlBrandAutomaticPrint(input: unknown, write = false) {
  const session = await requirePlatformSuperuser();
  const parsed = write ? automaticPrintCommandSchema.safeParse(input) : automaticPrintScopeSchema.safeParse(input);
  if (!parsed.success) throw new AutomaticPrintError('automatic_print_invalid', 400);
  if (write && process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') throw new AutomaticPrintError('automatic_print_unavailable');
  const brandId = parsed.data.brandId, db = getAdminDb(), actorId = principalKey(session.identity);
  return db.runTransaction(async transaction => {
    const access = policySchema.safeParse((await transaction.get(db.collection('platformAdminControl').doc('access-v1'))).data());
    if (!access.success || !isSuperuser(access.data, actorId)) throw new AuthorityError('forbidden');
    const brandRef = db.collection('brands').doc(brandId), brand = await transaction.get(brandRef), data = brand.data();
    if (!brand.exists || !data || data.id !== undefined && data.id !== brandId
      || data.deletedAt != null || ['deleted', 'isDeleted', 'isTestData'].some(key => data[key] !== undefined && data[key] !== false)) throw new AutomaticPrintError('automatic_print_conflict', 409);
    const saved = await readBrandAutomaticPrintPolicy({ db, transaction }, brandId);
    if (!write) return projectBrandAutomaticPrint(brandId, saved);
    const command = automaticPrintCommandSchema.parse(parsed.data);
    if (command.expectedRevision !== (saved?.revision ?? 0)) throw new AutomaticPrintError('automatic_print_conflict', 409);
    if (command.enabled && (!['active', 'trialing'].includes(data.status) || process.env.ORDERFLY_PRINT_INTENTS_ENABLED !== 'true')) throw new AutomaticPrintError('automatic_print_conflict', 409);
    // Repeated saves never rotate the epoch or invalidate queued work. An explicit
    // OFF save still creates an override, stopping any old supervised window.
    if (saved && saved.enabled === command.enabled) return projectBrandAutomaticPrint(brandId, saved);
    const now = Date.now(), next = storedBrandAutomaticPrintSchema.safeParse({ schemaVersion: 1, brandId,
      revision: (saved?.revision ?? 0) + 1, enabled: command.enabled, enabledAt: command.enabled ? now : null,
      activationId: command.enabled ? randomBytes(32).toString('base64url') : null, updatedAt: now });
    if (!next.success || saved && now < saved.updatedAt) throw new AutomaticPrintError('automatic_print_unavailable');
    transaction.set(brandRef.collection('printSettings').doc('automatic'), next.data);
    transaction.create(brandRef.collection('printSettingsAudit').doc(String(next.data.revision)), {
      schemaVersion: 1, brandId, actorId, action: 'brand.automaticPrint.change', enabled: command.enabled, revision: next.data.revision, at: now,
    });
    return projectBrandAutomaticPrint(brandId, next.data);
  }, write ? undefined : { readOnly: true });
}
