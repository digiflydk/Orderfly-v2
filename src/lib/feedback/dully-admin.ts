import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireFeedbackAccess, assertFeedbackBrand, canEditFeedbackBrand } from './access';
import { ESMERALDA_FEEDBACK_BRAND } from './esmeralda-booking-setup';
import { dullyConfigureSchema, dullyScopeSchema, dullyScopeId, dullySourceId, dullyImportRowSchema, dullySameIdentity, dullyEligible, dullyDueAt, dullyHash, DULLY_NEVER, DULLY_TEST_EMAIL } from './dully-contract';
import { feedbackAutomation } from './mail-config';
import { dullyFingerprint } from './dully-source';
export type { DullyImportRow } from './dully-contract';
type Scope = { brandId: string; locationId: string };
export type DullyFeedbackState = {
  configuration: null | { accountId: string; restaurantId: string; paused: boolean; approvedAt: number | null; testSourceId: string | null; approvedTestSourceId: string | null };
  test: null | { sourceId: string; experienceType: 'pickup' | 'delivery'; state: string };
  rows: Array<{ id: string; orderNumber: string; experienceType: 'pickup' | 'delivery'; email: string; status: string; mailState: string; isTest: boolean; orderedAt: string; updatedAt: number }>;
  hasMore: boolean; masterEmailEnabled: boolean;
  counts: { imported: number; eligible: number; pending: number; accepted: number; failed: number; uncertain: number }; canEdit: boolean;
};
async function scope(input: Scope, edit = false) {
  const value = dullyScopeSchema.parse(input), access = await requireFeedbackAccess(edit ? 'feedback:edit' : 'feedback:view');
  assertFeedbackBrand(access, value.brandId);
  if (edit && !canEditFeedbackBrand(access, value.brandId)) throw new Error('Du har ikke redigeringsadgang.');
  // Fixed test recipient belongs to Esmeralda. Other tenants need a separately configured trusted recipient.
  if (value.brandId !== ESMERALDA_FEEDBACK_BRAND) throw new Error('Dully-feedback er kun opsat for Esmeralda.');
  const db = getAdminDb(), [brand, location] = await Promise.all([db.collection('brands').doc(value.brandId).get(), db.collection('locations').doc(value.locationId).get()]);
  if (brand.data()?.status !== 'active' || location.data()?.brandId !== value.brandId || location.data()?.isActive === false) throw new Error('Brand eller lokation er ikke aktiv.');
  return { ...value, db, access, scopeId: dullyScopeId(value.brandId, value.locationId) };
}
function audit(db: FirebaseFirestore.Firestore, tx: FirebaseFirestore.Transaction, actorId: string, scopeId: string, action: string, details: Record<string, unknown> = {}) {
  tx.create(db.collection('dullyFeedbackAudit').doc(), { actorId, scopeId, action, ...details, createdAt: Date.now() });
}
export async function getDullyFeedbackState(brandId: string, locationId: string): Promise<DullyFeedbackState> {
  const s = await scope({ brandId, locationId }), config = (await s.db.collection('dullyFeedbackConfigurations').doc(s.scopeId).get()).data();
  const docs = await s.db.collection('dullyFeedbackSources').where('historyKey', '>=', s.scopeId + ':').where('historyKey', '<=', s.scopeId + ':\uf8ff').orderBy('historyKey', 'desc').limit(501).get();
  const rows = docs.docs.slice(0, 500).map(d => ({ ...d.data(), id: d.id })) as any[];
  const masterSettings = feedbackAutomation((await s.db.collection('feedbackSettings').doc(brandId).get()).data());
  const currentFingerprint = config ? await dullyFingerprint(brandId, locationId, config as any).catch(() => null) : null;
  const approvalValid = Boolean(config?.approvedAt && config?.approvedFingerprint === currentFingerprint?.fingerprint && config?.approvedTestSourceId === config?.testSourceId);
  const lastTest = config?.testSourceId ? (await s.db.collection('dullyFeedbackSources').doc(config.testSourceId).get()).data() : null;
  return {
    hasMore: docs.docs.length > 500, masterEmailEnabled: masterSettings.emailEnabled,
    configuration: config ? { accountId: config.accountId, restaurantId: config.restaurantId, paused: config.paused !== false, approvedAt: approvalValid ? config.approvedAt : null, testSourceId: config.testSourceId || null, approvedTestSourceId: config.approvedTestSourceId || null } : null,
    test: lastTest ? { sourceId: lastTest.id, experienceType: lastTest.experienceType, state: lastTest.mailState } : null,
    rows: rows.sort((a, b) => b.updatedAt - a.updatedAt).map(r => ({ id: r.id, orderNumber: r.orderNumber, experienceType: r.experienceType, email: r.email, status: r.status, mailState: r.mailState, isTest: r.isTest === true, orderedAt: r.orderedAt, updatedAt: r.updatedAt })),
    counts: { imported: rows.filter(r => !r.isTest).length, eligible: rows.filter(r => !r.isTest && dullyEligible(r)).length,
      pending: rows.filter(r => !r.isTest && r.mailState === 'pending').length, accepted: rows.filter(r => !r.isTest && r.mailState === 'accepted').length,
      failed: rows.filter(r => !r.isTest && r.mailState === 'failed').length, uncertain: rows.filter(r => !r.isTest && r.mailState === 'uncertain').length },
    canEdit: canEditFeedbackBrand(s.access, brandId),
  };
}
export async function configureDullyFeedback(input: Scope & { accountId: string; restaurantId: string }) {
  const value = dullyConfigureSchema.parse(input), s = await scope(value, true), ref = s.db.collection('dullyFeedbackConfigurations').doc(s.scopeId);
  const binding = s.db.collection('dullyFeedbackBindings').doc(dullyHash([value.accountId, value.restaurantId]));
  await s.db.runTransaction(async tx => {
    const [existing, bound] = await Promise.all([tx.get(ref), tx.get(binding)]);
    const old = existing.data();
    if (old && (old.accountId !== value.accountId || old.restaurantId !== value.restaurantId)) throw new Error('En eksisterende Dully-kobling kan ikke flyttes. Kontakt administrator.');
    if (bound.exists && bound.data()?.scopeId !== s.scopeId) throw new Error('Dully-restauranten er allerede knyttet til en anden lokation.');
    if (!existing.exists) {
      tx.create(ref, { ...value, scopeId: s.scopeId, paused: true, approvedAt: null, approvedFingerprint: null, approvedTestSourceId: null, testSourceId: null, createdAt: Date.now(), updatedAt: Date.now() });
      if (!bound.exists) tx.create(binding, { scopeId: s.scopeId, brandId: s.brandId, locationId: s.locationId });
      audit(s.db, tx, s.access.uid, s.scopeId, 'configured');
    }
  });
  return { ok: true as const };
}
export async function importDullyFeedback(input: Scope & { rows: unknown[] }) {
  const s = await scope(input, true), rows = z.array(dullyImportRowSchema).min(1).max(100).parse(input.rows), now = Date.now();
  if (new Set(rows.map(r => r.externalOrderId)).size !== rows.length) throw new Error('Samme ordre står flere gange i importen.');
  const configRef = s.db.collection('dullyFeedbackConfigurations').doc(s.scopeId), result = { ok: true as const, imported: 0, unchanged: 0, updated: 0, skipped: 0 };
  // One bounded transaction gives all-or-nothing validation and prevents concurrent imports from duplicating sources.
  return s.db.runTransaction(async tx => {
    const config = (await tx.get(configRef)).data(); if (!config) throw new Error('Gem Dully-koblingen først.');
    const refs = rows.map(r => s.db.collection('dullyFeedbackSources').doc(dullySourceId(s.brandId, config.accountId, r.externalOrderId)));
    const snapshots = await Promise.all(refs.map(r => tx.get(r)));
    const counts = { ...result };
    rows.forEach((row, i) => {
      if (row.externalRestaurantId !== config.restaurantId || Date.parse(row.orderedAt) > now || (row.completedAt && Date.parse(row.completedAt) > now)) throw new Error('Ordren matcher ikke restauranten eller har en fremtidig dato.');
      const old = snapshots[i].data(), eligible = dullyEligible(row, now), dueAt = eligible ? dullyDueAt(row.completedAt!) : DULLY_NEVER;
      if (old) {
        if (!dullySameIdentity(old, row, s.locationId) || old.scopeId !== s.scopeId || old.isTest) throw new Error('Ordreidentiteten eller modtageren er ændret. Importen er afvist.');
        const changed = old.status !== row.status || old.paymentStatus !== row.paymentStatus || old.completedAt !== row.completedAt;
        if (changed) counts.updated++; else counts.unchanged++;
        tx.update(refs[i], { status: row.status, paymentStatus: row.paymentStatus, completedAt: row.completedAt,
          dueAt: old.mailState === 'pending' ? dueAt : old.dueAt, lastVerifiedAt: now, updatedAt: now, historyKey: s.scopeId + ':' + now + ':' + refs[i].id });
      } else {
        counts.imported++;
        tx.create(refs[i], { ...row, id: refs[i].id, sourceType: 'dully_order', scopeId: s.scopeId, brandId: s.brandId, locationId: s.locationId,
          customerId: refs[i].id, accountId: config.accountId, isTest: false, invitationStatus: 'active', expiresAt: 0,
          language: 'da', fingerprint: '', mailState: 'pending', eventId: randomUUID(), attempts: 0, dueAt,
          createdAt: now, updatedAt: now, lastVerifiedAt: now, historyKey: s.scopeId + ':' + now + ':' + refs[i].id });
      }
      if (!eligible) counts.skipped++;
    });
    audit(s.db, tx, s.access.uid, s.scopeId, 'imported', counts);
    tx.update(configRef, { lastImportAt: now, updatedAt: now });
    return counts;
  });
}
export async function sendDullyFeedbackTest(input: Scope & { experienceType: 'pickup' | 'delivery' }) {
  const type = z.enum(['pickup', 'delivery']).parse(input.experienceType), s = await scope(input, true);
  const configRef = s.db.collection('dullyFeedbackConfigurations').doc(s.scopeId), config = (await configRef.get()).data();
  if (!config) throw new Error('Gem Dully-koblingen først.');
  const prepared = await dullyFingerprint(s.brandId, s.locationId, config as any), now = Date.now();
  const id = dullyHash(['dully-test', s.scopeId, prepared.fingerprint, type]), ref = s.db.collection('dullyFeedbackSources').doc(id);
  await s.db.runTransaction(async tx => {
    const [current, existing] = await Promise.all([tx.get(configRef), tx.get(ref)]);
    const final = current.exists ? await dullyFingerprint(s.brandId, s.locationId, current.data() as any, tx) : null;
    if (final?.fingerprint !== prepared.fingerprint) throw new Error('Skema eller mailopsætning er ændret. Prøv igen.');
    if (current.data()?.accountId !== config.accountId || current.data()?.restaurantId !== config.restaurantId) throw new Error('Koblingen er ændret. Prøv igen.');
    if (!existing.exists) tx.create(ref, { id, scopeId: s.scopeId, brandId: s.brandId, locationId: s.locationId, sourceType: 'dully_order', customerId: id,
      email: DULLY_TEST_EMAIL, experienceType: type, ...prepared, orderNumber: 'TEST', isTest: true, status: 'completed', paymentStatus: 'paid',
      orderedAt: new Date(now).toISOString(), completedAt: new Date(now).toISOString(), invitationStatus: 'active', expiresAt: now + 30 * 86400000,
      mailState: 'pending', eventId: randomUUID(), attempts: 0, dueAt: now, createdAt: now, updatedAt: now, lastVerifiedAt: now, historyKey: s.scopeId + ':' + now + ':' + id });
    if (existing.data()?.mailState === 'failed') tx.update(ref, { mailState: 'pending', dueAt: now, lastError: null, lease: null, updatedAt: now });
    if (existing.data()?.mailState === 'uncertain') throw new Error('Testens afsendelse er ukendt. Kontrollér først mailtjenestens historik; testen bliver ikke sendt igen.');
    tx.update(configRef, { testSourceId: id, approvedAt: null, approvedFingerprint: null, approvedTestSourceId: null, paused: true, updatedAt: now });
    audit(s.db, tx, s.access.uid, s.scopeId, 'test_requested', { sourceId: id });
  });
  return { ok: true as const, sourceId: id };
}
export async function approveDullyFeedback(input: Scope & { testSourceId: string }) {
  const id = z.string().regex(/^[a-f0-9]{64}$/).parse(input.testSourceId), s = await scope(input, true), ref = s.db.collection('dullyFeedbackConfigurations').doc(s.scopeId);
  const config = (await ref.get()).data(); if (!config) throw new Error('Dully-koblingen mangler.');
  const prepared = await dullyFingerprint(s.brandId, s.locationId, config as any);
  await s.db.runTransaction(async tx => {
    const [current, test] = await Promise.all([tx.get(ref), tx.get(s.db.collection('dullyFeedbackSources').doc(id))]), row = test.data();
    const final = current.exists ? await dullyFingerprint(s.brandId, s.locationId, current.data() as any, tx) : null;
    if (final?.fingerprint !== prepared.fingerprint) throw new Error('Skema eller mailopsætning er ændret. Send en ny test.');
    if (current.data()?.testSourceId !== id || !row?.isTest || row.scopeId !== s.scopeId || row.email !== DULLY_TEST_EMAIL || row.mailState !== 'accepted' || row.fingerprint !== prepared.fingerprint || row.expiresAt <= Date.now()) throw new Error('En aktuel test skal være accepteret af mailtjenesten før godkendelse.');
    tx.update(ref, { approvedAt: Date.now(), approvedBy: s.access.uid, approvedFingerprint: prepared.fingerprint, approvedTestSourceId: id, updatedAt: Date.now() });
    audit(s.db, tx, s.access.uid, s.scopeId, 'test_approved', { sourceId: id });
  });
  return { ok: true as const };
}
export async function setDullyFeedbackPaused(input: Scope & { paused: boolean }) {
  const paused = z.boolean().parse(input.paused), s = await scope(input, true), ref = s.db.collection('dullyFeedbackConfigurations').doc(s.scopeId);
  const config = (await ref.get()).data(); if (!config) throw new Error('Dully-koblingen mangler.');
  const prepared = paused ? null : await dullyFingerprint(s.brandId, s.locationId, config as any);
  await s.db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    const final = !paused && current ? await dullyFingerprint(s.brandId, s.locationId, current as any, tx) : null;
    const test = current?.approvedTestSourceId ? (await tx.get(s.db.collection('dullyFeedbackSources').doc(current.approvedTestSourceId))).data() : null;
    if (!current || (!paused && (final?.emailEnabled !== true || final?.fingerprint !== prepared?.fingerprint || !current.approvedAt || current.approvedFingerprint !== prepared?.fingerprint || !test?.isTest || test.scopeId !== s.scopeId || test.mailState !== 'accepted' || test.fingerprint !== prepared?.fingerprint))) throw new Error('Godkend først den aktuelle testmail.');
    tx.update(ref, { paused, updatedAt: Date.now() });
    audit(s.db, tx, s.access.uid, s.scopeId, paused ? 'paused' : 'resumed');
  });
  return { ok: true as const };
}
