import 'server-only';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, principalKey, type VerifiedIdentity } from '@/lib/access/authority';
import { requirePlatformSuperuser, verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { isSuperuser, policySchema } from '@/lib/access/policy';
import { DEFAULT_RECEIPT_SETTINGS, receiptSettingsSchema, type ReceiptSettingsRecord } from './settings';

export const receiptBrandIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const receiptSettingsRecordSchema = z.object({ brandId: receiptBrandIdSchema,
  revision: z.number().int().nonnegative().safe(), settings: receiptSettingsSchema }).strict();
export const receiptSettingsCommandSchema = z.object({ brandId: receiptBrandIdSchema,
  expectedRevision: z.number().int().nonnegative().safe().max(Number.MAX_SAFE_INTEGER - 1), settings: receiptSettingsSchema }).strict();
const storedSchema = receiptSettingsRecordSchema.extend({ schemaVersion: z.literal(1), revision: z.number().int().positive().safe() }).strict();
export class ReceiptSettingsError extends Error {
  constructor(readonly code: 'invalid_request' | 'record_conflict' | 'settings_unavailable', readonly status: number) { super(code); }
}
const invalid = (): never => { throw new ReceiptSettingsError('invalid_request', 400); };
function savedRecord(snapshot: FirebaseFirestore.DocumentSnapshot, brandId: string): ReceiptSettingsRecord {
  if (!snapshot.exists) return { brandId, revision: 0, settings: { ...DEFAULT_RECEIPT_SETTINGS } };
  const parsed = storedSchema.safeParse(snapshot.data());
  if (!parsed.success || snapshot.id !== brandId || parsed.data.brandId !== brandId) throw new ReceiptSettingsError('settings_unavailable', 503);
  return { brandId, revision: parsed.data.revision, settings: parsed.data.settings };
}
async function scope(tx: FirebaseFirestore.Transaction, identity: VerifiedIdentity, brandId: string, admin: boolean, locationId?: string | null) {
  const db = getAdminDb();
  if (admin) {
    const policy = policySchema.safeParse((await tx.get(db.collection('platformAdminControl').doc('access-v1'))).data());
    if (!policy.success || !isSuperuser(policy.data, principalKey(identity))) throw new AuthorityError('forbidden');
  }
  await authorizeTransaction(tx, identity, { brandId, locationId }, admin ? 'orderfly.catalog:edit' : 'orderfly.orders:view', admin ? 'company' : 'location');
  // Historical orders use the existing orders:view contract: current policy,
  // native brand existence and location ownership. Brand lifecycle flags must
  // not hide an otherwise authorized historical receipt.
  if (!admin) return;
  const brand = await tx.get(db.collection('brands').doc(brandId)), row = brand.data();
  if (!brand.exists || brand.id !== brandId || !row || !['active', 'pending', 'trialing'].includes(row.status)
    || (row.id !== undefined && row.id !== brandId)
    || ['deleted', 'isDeleted', 'isTestData'].some(key => row[key] !== undefined && row[key] !== false)
    || (row.deletedAt !== undefined && row.deletedAt !== null) || (row.isActive !== undefined && row.isActive !== true)) throw new AuthorityError('forbidden');
}
async function safely<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); } catch (error) {
    if (error instanceof AuthorityError || error instanceof ReceiptSettingsError) throw error;
    throw new ReceiptSettingsError('settings_unavailable', 503);
  }
}
export async function readReceiptSettings(brandIdInput: unknown): Promise<ReceiptSettingsRecord> {
  const session = await requirePlatformSuperuser();
  const parsed = receiptBrandIdSchema.safeParse(brandIdInput); if (!parsed.success) return invalid();
  return safely(async () => {
    const db = getAdminDb();
    return db.runTransaction(async tx => {
      await scope(tx, session.identity, parsed.data, true);
      return savedRecord(await tx.get(db.collection('receiptSettings').doc(parsed.data)), parsed.data);
    });
  });
}
export async function readReceiptSettingsForOrder(brandId: string, locationId?: string | null): Promise<ReceiptSettingsRecord> {
  const identity = await verifiedOrderflyIdentity();
  if (!receiptBrandIdSchema.safeParse(brandId).success || (locationId != null && !receiptBrandIdSchema.safeParse(locationId).success)) return invalid();
  return safely(async () => {
    const db = getAdminDb();
    return db.runTransaction(async tx => {
      await scope(tx, identity, brandId, false, locationId);
      return savedRecord(await tx.get(db.collection('receiptSettings').doc(brandId)), brandId);
    });
  });
}
export async function writeReceiptSettings(input: unknown): Promise<ReceiptSettingsRecord> {
  const session = await requirePlatformSuperuser();
  const parsed = receiptSettingsCommandSchema.safeParse(input); if (!parsed.success) return invalid();
  const command = parsed.data;
  return safely(async () => {
    const db = getAdminDb(), ref = db.collection('receiptSettings').doc(command.brandId);
    return db.runTransaction(async tx => {
      await scope(tx, session.identity, command.brandId, true);
      const previous = savedRecord(await tx.get(ref), command.brandId), revision = command.expectedRevision + 1;
      const auditRef = ref.collection('audit').doc(String(revision)), audit = await tx.get(auditRef);
      if (previous.revision !== command.expectedRevision || audit.exists) throw new ReceiptSettingsError('record_conflict', 409);
      const result = { brandId: command.brandId, revision, settings: command.settings };
      tx.create(auditRef, { schemaVersion: 1, action: 'receipt.settings.update', actorId: principalKey(session.identity),
        brandId: command.brandId, previousRevision: previous.revision, revision, settings: command.settings, createdAt: FieldValue.serverTimestamp() });
      if (previous.revision === 0) tx.create(ref, { schemaVersion: 1, ...result });
      else tx.set(ref, { schemaVersion: 1, ...result });
      return result;
    });
  });
}
