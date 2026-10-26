import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { policySchema, isSuperuser } from '@/lib/access/policy';
import { getOrigin } from '@/lib/url';
import { createDeliverySecretStore, deliverySecretProjectId, DeliverySecretError } from './secrets';
import { createGeoapifyBudget } from '../routing/geoapify/budget';
import { createGeoapifyRoutingAdapter } from '../routing/geoapify/adapter';

export const GEOAPIFY_PLATFORM_PATH = 'deliveryPlatformConfigs/geoapify';
const revision = z.number().int().nonnegative().safe().max(Number.MAX_SAFE_INTEGER - 1);
const approval = z.string().trim().max(500).refine(v => !/[\p{Cc}\p{Cf}]/u.test(v));
const namespace = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const fields = { enabled: z.boolean(), retentionApproved: z.boolean(), routingApprovalRef: approval,
  retentionApprovalRef: approval, quotaNamespace: namespace };
export const geoapifyPlatformRecordSchema = z.object({ version: z.literal(1), revision: revision.refine(v => v > 0), ...fields,
  secretRef: z.string().regex(/^projects\/[a-z][a-z0-9-]{4,62}\/secrets\/orderfly-geoapify-sandbox-[a-f0-9]{64}\/versions\/[1-9][0-9]{0,10}$/).nullable(),
  updatedAt: z.string().datetime(),
}).strict();
const commandSchema = z.object({ expectedRevision: revision, enabled: fields.enabled, retentionApproved: fields.retentionApproved,
  routingApprovalRef: approval.optional(), retentionApprovalRef: approval.optional(), quotaNamespace: namespace.optional(),
  apiKey: z.string().min(16).max(300).regex(/^[^\s\p{Cc}\p{Cf}]+$/u).optional(),
}).strict();
type PlatformRecord = z.infer<typeof geoapifyPlatformRecordSchema>;
const secretScope = { environment: 'sandbox' as const, merchantId: 'platform', kind: 'geoapify' as const };
const ref = () => getAdminDb().collection('deliveryPlatformConfigs').doc('geoapify');
const defaults = { revision: 0, enabled: false, retentionApproved: false, routingApprovalRef: '', retentionApprovalRef: '',
  quotaNamespace: 'orderfly-delivery-geoapify-platform-v1', keyConfigured: false,
  limits: { quotesPerDay: 100 as const, requestsPerSecond: 5 as const } };
function project(record: PlatformRecord | null) {
  return record ? { revision: record.revision, enabled: record.enabled, retentionApproved: record.retentionApproved,
    routingApprovalRef: record.routingApprovalRef, retentionApprovalRef: record.retentionApprovalRef,
    quotaNamespace: record.quotaNamespace, keyConfigured: !!record.secretRef, limits: { ...defaults.limits } } : { ...defaults, limits: { ...defaults.limits } };
}
export class DeliveryPlatformError extends Error {
  constructor(readonly code: 'invalid_request' | 'record_conflict' | 'quota_namespace_locked' | 'platform_unavailable', readonly status: number) { super(code); }
}
export async function loadGeoapifyPlatformInTransaction(tx: FirebaseFirestore.Transaction): Promise<PlatformRecord | null> {
  const row = await tx.get(ref());
  return row.exists ? geoapifyPlatformRecordSchema.parse(row.data()) : null;
}
async function load() { return getAdminDb().runTransaction(loadGeoapifyPlatformInTransaction); }
async function authorize(tx: FirebaseFirestore.Transaction, actor: string) {
  const row = await tx.get(getAdminDb().collection('platformAdminControl').doc('access-v1'));
  if (!row.exists || !isSuperuser(policySchema.parse(row.data()), actor)) throw new AuthorityError('forbidden');
}
/** Internal config-only view; no credentials or provider requests. */
export async function getPlatformGeoapifyReadiness() {
  try { const saved = await load(); return saved ? project(saved) : null; } catch { throw new DeliveryPlatformError('platform_unavailable', 503); }
}
/** Internal server composition only; never export from a server-action module. */
export async function getPlatformGeoapifyRuntime() {
  try {
    const saved = await load();
    if (!saved?.enabled || !saved.retentionApproved || !saved.routingApprovalRef || !saved.retentionApprovalRef || !saved.secretRef) return null;
    const apiKey = await createDeliverySecretStore({ projectId: deliverySecretProjectId() }).read(saved.secretRef, secretScope);
    const current = await load();
    if (!current || JSON.stringify(current) !== JSON.stringify(saved)) return null;
    return { ...project(saved), apiKey };
  } catch { return null; }
}
export async function readGeoapifyPlatform() {
  const session = await requirePlatformSuperuser(), actor = principalKey(session.identity);
  return getAdminDb().runTransaction(async tx => { await authorize(tx, actor); return project(await loadGeoapifyPlatformInTransaction(tx)); });
}
export async function writeGeoapifyPlatform(raw: unknown) {
  const session = await requirePlatformSuperuser(), actor = principalKey(session.identity);
  const parsed = commandSchema.safeParse(raw); if (!parsed.success) throw new DeliveryPlatformError('invalid_request', 400);
  const command = parsed.data;
  const validate = (saved: PlatformRecord | null) => {
    if ((saved?.revision ?? 0) !== command.expectedRevision) throw new DeliveryPlatformError('record_conflict', 409);
    if (command.enabled && (!command.retentionApproved || !(command.apiKey || saved?.secretRef))) throw new DeliveryPlatformError('invalid_request', 400);
  };
  await getAdminDb().runTransaction(async tx => { await authorize(tx, actor); validate(await loadGeoapifyPlatformInTransaction(tx)); });
  // Immutable versions may be orphaned by a raced CAS, but never become active without the final authorized commit.
  const provisioned = command.apiKey ? await createDeliverySecretStore({ projectId: deliverySecretProjectId() }).provision({ ...secretScope, value: command.apiKey }) : null;
  return getAdminDb().runTransaction(async tx => {
    await authorize(tx, actor);
    const saved = await loadGeoapifyPlatformInTransaction(tx); validate(saved);
    const approvalRef = `${GEOAPIFY_PLATFORM_PATH}/audit/${command.expectedRevision + 1}`;
    const approved = command.enabled && command.retentionApproved;
    const next = geoapifyPlatformRecordSchema.parse({ version: 1, revision: command.expectedRevision + 1,
      enabled: command.enabled, retentionApproved: command.retentionApproved, routingApprovalRef: approved ? approvalRef : saved?.routingApprovalRef ?? '',
      retentionApprovalRef: approved ? approvalRef : saved?.retentionApprovalRef ?? '', quotaNamespace: saved?.quotaNamespace ?? defaults.quotaNamespace,
      secretRef: provisioned ?? saved?.secretRef ?? null, updatedAt: new Date().toISOString() });
    const audit = ref().collection('audit').doc(String(next.revision));
    if ((await tx.get(audit)).exists) throw new DeliveryPlatformError('record_conflict', 409);
    tx.create(audit, { action: 'delivery.platform.geoapify.update', actorId: actor, previousRevision: command.expectedRevision,
      configuration: project(next), credentialChanged: !!provisioned, createdAt: next.updatedAt });
    if (saved) tx.set(ref(), next); else tx.create(ref(), next);
    return project(next);
  });
}
export async function checkGeoapifyPlatform(raw: unknown) {
  const session = await requirePlatformSuperuser(), actor = principalKey(session.identity);
  const parsed = z.object({ expectedRevision: revision }).strict().safeParse(raw);
  if (!parsed.success) throw new DeliveryPlatformError('invalid_request', 400);
  const saved = await getAdminDb().runTransaction(async tx => {
    await authorize(tx, actor); const value = await loadGeoapifyPlatformInTransaction(tx);
    if ((value?.revision ?? 0) !== parsed.data.expectedRevision) throw new DeliveryPlatformError('record_conflict', 409);
    return value;
  });
  let code: 'connected' | 'not_configured' | 'connection_failed' = 'not_configured';
  if (saved?.secretRef && saved.retentionApproved && saved.routingApprovalRef && saved.retentionApprovalRef) {
    code = 'connection_failed';
    try {
      const apiKey = await createDeliverySecretStore({ projectId: deliverySecretProjectId() }).read(saved.secretRef, secretScope);
      // Recheck authorization and revision after external secret I/O, before reserving any provider request.
      await getAdminDb().runTransaction(async tx => { await authorize(tx, actor); const current = await loadGeoapifyPlatformInTransaction(tx);
        if (!current || current.revision !== saved.revision) throw new DeliveryPlatformError('record_conflict', 409); });
      const budget = createGeoapifyBudget({ quotaNamespace: saved.quotaNamespace });
      const adapter = createGeoapifyRoutingAdapter({ apiKey, fetch, reserveQuote: budget.reserveQuote, reserveRequest: budget.reserveRequest });
      const result = await adapter.resolve({ street: 'Rådhuspladsen 1', postalCode: '1550', city: 'København V', countryCode: 'DK' });
      if (result.kind === 'verified') code = 'connected';
    } catch (error) { if (error instanceof AuthorityError || error instanceof DeliveryPlatformError || error instanceof DeliverySecretError) throw error; }
  }
  const result = { ok: code === 'connected', code, checkedAt: new Date().toISOString(), revision: saved?.revision ?? 0 };
  await getAdminDb().runTransaction(async tx => {
    await authorize(tx, actor); const current = await loadGeoapifyPlatformInTransaction(tx);
    if ((current?.revision ?? 0) !== result.revision) throw new DeliveryPlatformError('record_conflict', 409);
    tx.create(ref().collection('checks').doc(randomUUID()), { ...result, actorId: actor });
  });
  return result;
}
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
async function http(request: Request, method: 'GET' | 'PUT' | 'POST') {
  try {
    await requirePlatformSuperuser();
    const url = new URL(request.url);
    if (request.headers.get('sec-fetch-site') === 'cross-site' || method !== 'GET' && request.headers.get('origin') !== await getOrigin()) return reply({ error: 'forbidden' }, 403);
    if (request.method !== method || url.search || url.username || url.password) return reply({ error: 'invalid_request' }, 400);
    if (method === 'GET') return reply(await readGeoapifyPlatform());
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return reply({ error: 'invalid_request' }, 400);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: 'invalid_request' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > 8192) { await reader.cancel().catch(() => undefined); return reply({ error: 'invalid_request' }, 400); } chunks.push(value); }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { return reply({ error: 'invalid_request' }, 400); }
    return reply(method === 'PUT' ? await writeGeoapifyPlatform(body) : await checkGeoapifyPlatform(body));
  } catch (error) {
    if (error instanceof AuthorityError && [401, 403].includes(error.status)) return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status);
    if (error instanceof DeliverySecretError) return reply({ error: error.code }, 503);
    if (error instanceof DeliveryPlatformError) return reply({ error: error.code }, error.status);
    return reply({ error: 'platform_unavailable' }, 503);
  }
}
export const getDeliveryPlatform = (request: Request) => http(request, 'GET');
export const putDeliveryPlatform = (request: Request) => http(request, 'PUT');
export const postDeliveryPlatformCheck = (request: Request) => http(request, 'POST');
