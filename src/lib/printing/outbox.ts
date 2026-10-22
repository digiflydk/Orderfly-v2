import 'server-only';
import { z } from 'zod';
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { StripeSettlementPrintCapability, PickupSettlementPrintCapability } from '@/lib/server/settle-checkout';
import type { PickupAcceptanceCapability } from '@/lib/server/accept-pickup-checkout';
import { kitchenPrintIntentEligibility, printJobId, type KitchenOrder } from './domain';
import { storedPrinterSchema } from './storage';
import { storedPrintQueueSchema as queueSchema, storedQueuedPrintJobSchema as jobSchema, PRINT_QUEUE_LIMIT } from './queue-storage';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const scope = { brandId: id, locationId: id, printerId: id };
const commandSchema = z.object({ ...scope, orderId: id, kind: z.enum(['kitchen', 'packing']) }).strict();
const orderSchema = z.object({
  brandId: id, locationId: id, status: z.string(), paymentStatus: z.string(),
  paymentMethod: z.string(), deliveryType: z.string(), discountReservation: z.string().optional(),
  psp: z.unknown().optional(),
});
export const PRINT_INTENT_BATCH_LIMIT = 64;
export const PRINT_INTENT_BATCH_PRINTER_LIMIT = 16;
export const PRINT_TRANSACTION_WRITE_LIMIT = 500;
const batchSchema = z.object({
  intents: z.array(commandSchema).min(1).max(PRINT_INTENT_BATCH_LIMIT),
  // The trusted caller must reserve ALL of its other transaction writes, including
  // the order transition. The outbox never starts/commits its own transaction.
  reservedWriteCount: z.number().int().nonnegative().max(PRINT_TRANSACTION_WRITE_LIMIT),
}).strict();
type Command = z.infer<typeof commandSchema>;
const manifestTargetSchema = z.object({ printerId: id, printerRevision: z.number().int().positive().safe(),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/), kinds: z.array(z.enum(['kitchen', 'packing'])).min(1).max(2),
  lineIds: z.array(id).min(1).max(50) }).strict();
const manifestIdentitySchema = z.object({ schemaVersion: z.literal(1), id: z.literal('original'),
  orderId: id, brandId: id, locationId: id, originalRevision: z.literal(0),
  policyRevision: z.number().int().positive().safe(), routingRevision: z.number().int().positive().safe(),
  rulesHash: z.string().regex(/^[a-f0-9]{64}$/), catalogHash: z.string().regex(/^[a-f0-9]{64}$/),
  targets: z.array(manifestTargetSchema).min(1).max(16) }).strict();
const storedManifestSchema = manifestIdentitySchema.extend({ createdAt: z.number().int().positive().safe() });
function boundedManifest(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).length > 13 || !Array.isArray(row.targets) || row.targets.length > 16) return false;
  for (const field of ['orderId', 'brandId', 'locationId', 'rulesHash', 'catalogHash']) if (typeof row[field] !== 'string' || (row[field] as string).length > 128) return false;
  return row.targets.every(target => target && typeof target === 'object' && !Array.isArray(target)
    && Reflect.ownKeys(target).length <= 5 && typeof target.printerId === 'string' && target.printerId.length <= 128
    && typeof target.configurationHash === 'string' && target.configurationHash.length <= 64
    && Array.isArray(target.kinds) && target.kinds.length <= 2 && target.kinds.every((kind: unknown) => typeof kind === 'string' && kind.length <= 7)
    && Array.isArray(target.lineIds) && target.lineIds.length <= 50 && target.lineIds.every((id: unknown) => typeof id === 'string' && id.length <= 128));
}



export class PrintOutboxError extends Error {
  constructor(readonly code: 'invalid_intent' | 'ineligible_intent' | 'queue_unverified' | 'job_conflict' | 'write_budget_exceeded') {
    super(code);
  }
}

/** Prepare ONE combined plan for every original intent in the caller's transaction.
 * Caller must authorize its server event/actor, reserve its other writes, finish ALL
 * reads, then apply atomically with its order mutation. Never prepare independent
 * plans against the same printer in one transaction. Already-eligible persisted
 * orders only; Pending->accepted/paid needs a separately reviewed trusted adapter.
 */
export async function prepareOriginalPrintIntents(db: Firestore, tx: Transaction, input: unknown) {
  return prepareBatch(db, tx, input);
}

type OriginalRead = (requireApplied?: boolean) => Readonly<{ order: Readonly<KitchenOrder>; writeCount: number; replay: boolean }>;
type OriginalAuthority = { read: OriginalRead; requireExistingJobs: boolean;
  manifestTargets: ReadonlyArray<z.infer<typeof manifestTargetSchema>>; freshOnly?: boolean };
/** Closed Stripe path: the fixed financial writer alone can mint this capability.
 * Lazy fixed import preserves module identity without an eager circular dependency.
 */
export async function prepareStripeSettlementPrintIntents(context: NativeTransactionContext, capability: StripeSettlementPrintCapability, input: unknown) {
  const read = (await import('@/lib/server/settle-checkout')).readStripeSettlementPrintCapability;
  return prepareAuthorizedOriginals(context, applied => read(context, capability, applied), input);
}

/** Fixed staff adapter; only the actual settlement writer can mint its capability. */
export async function preparePickupSettlementPrintIntents(context: NativeTransactionContext, capability: PickupSettlementPrintCapability, input: unknown) {
  const read = (await import('@/lib/server/settle-checkout')).readPickupSettlementPrintCapability;
  return prepareAuthorizedOriginals(context, applied => read(context, capability, applied), input, true);
}

/** Only the actual native unpaid acceptance writer can mint this capability.
 * Reserve its two fixed writes and one canonical manifest create together.
 */
export async function preparePickupAcceptancePrintIntents(context: NativeTransactionContext, capability: PickupAcceptanceCapability, input: unknown) {
  const reader = (await import('@/lib/server/accept-pickup-checkout')).readPickupAcceptanceCapability;
  const read = (applied = false) => {
    const value = reader(context, capability, applied);
    return { ...value, writeCount: value.writeCount + 1 };
  };
  return prepareAuthorizedOriginals(context, read, input, false, true);
}

async function prepareAuthorizedOriginals(context: NativeTransactionContext, read: OriginalRead, input: unknown,
  pickup = false, freshOnly = false) {
  const authority = read();
  const raw = input as { intents?: unknown; identity?: { targets?: unknown } } | null;
  const targets = raw?.identity?.targets;
  if (!raw || !Array.isArray(raw.intents) || raw.intents.length > PRINT_INTENT_BATCH_LIMIT
    || !Array.isArray(targets) || targets.length > 16 || !boundedManifest(raw.identity)
    || targets.some(target => !target || !Array.isArray(target.kinds) || target.kinds.length > 2
      || !Array.isArray(target.lineIds) || target.lineIds.length > 50)) throw new PrintOutboxError('invalid_intent');
  const parsed = z.object({ intents: z.array(commandSchema).min(1).max(PRINT_INTENT_BATCH_LIMIT), identity: manifestIdentitySchema }).strict().safeParse(input);
  if (!parsed.success || parsed.data.intents.some(intent => intent.orderId !== authority.order.id
    || intent.brandId !== authority.order.brandId || intent.locationId !== authority.order.locationId)) throw new PrintOutboxError('ineligible_intent');
  const identity = parsed.data.identity;
  if (identity.orderId !== authority.order.id || identity.brandId !== authority.order.brandId || identity.locationId !== authority.order.locationId
    || new Set(identity.targets.map(target => target.printerId)).size !== identity.targets.length
    || identity.targets.some(target => new Set(target.kinds).size !== target.kinds.length || new Set(target.lineIds).size !== target.lineIds.length)) throw new PrintOutboxError('invalid_intent');
  const expected = identity.targets.flatMap(target => target.kinds.map(kind => JSON.stringify([target.printerId, kind]))).sort();
  const actual = [...new Set(parsed.data.intents.map(intent => JSON.stringify([intent.printerId, intent.kind])))].sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new PrintOutboxError('invalid_intent');
  const manifestRef = context.db.collection('orders').doc(identity.orderId).collection('printIntents').doc('original');
  const manifest = await context.transaction.get(manifestRef);
  // A staff collection is later than unpaid acceptance. Without its canonical
  // original manifest there is no proof that legacy/orphan jobs did not already
  // print elsewhere. Current targets, held status and printer scans cannot prove
  // whole-order history absence. Only the separate trusted acceptance producer
  // may create these originals; staff settlement must never backfill them.
  if (pickup && !manifest.exists) throw new PrintOutboxError('job_conflict');
  const now = Date.now();
  if (!Number.isSafeInteger(now) || now <= 0) throw new PrintOutboxError('queue_unverified');
  const reuseManifest = authority.replay || (pickup && manifest.exists);
  if (reuseManifest) {
    if (!boundedManifest(manifest.data())) throw new PrintOutboxError('job_conflict');
    const saved = storedManifestSchema.safeParse(manifest.data());
    if (!manifest.exists || manifest.id !== 'original' || !saved.success || saved.data.createdAt > now) throw new PrintOutboxError('job_conflict');
    const { createdAt: _createdAt, ...prior } = saved.data;
    if (JSON.stringify(prior) !== JSON.stringify(identity)) throw new PrintOutboxError('job_conflict');
  } else if (manifest.exists) throw new PrintOutboxError('job_conflict');
  // The private financial capability reserves its own writes plus exactly one
  // manifest create for a fresh transition. Replay can never create a manifest.
  const plan = await prepareBatch(context.db, context.transaction, { intents: parsed.data.intents,
    reservedWriteCount: authority.writeCount - (!authority.replay && reuseManifest ? 1 : 0) }, { read, requireExistingJobs: reuseManifest, manifestTargets: identity.targets, freshOnly });
  return { ...plan, writeCount: plan.writeCount + (reuseManifest ? 0 : 1), apply() {
    read(true);
    if (!reuseManifest) context.transaction.create(manifestRef, { ...identity, createdAt: now });
    plan.apply();
  } };
}

async function prepareBatch(db: Firestore, tx: Transaction, input: unknown, settlement?: OriginalAuthority) {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) throw new PrintOutboxError('invalid_intent');
  const groups = new Map<string, Command[]>();
  const unique = new Map<string, Command>();
  for (const command of parsed.data.intents) {
    const jobId = printJobId({ ...command, revision: 0 });
    if (unique.has(jobId)) continue;
    unique.set(jobId, command);
    const key = JSON.stringify([command.brandId, command.locationId, command.printerId]);
    const commands = groups.get(key) || [];
    commands.push(command); groups.set(key, commands);
  }
  if (groups.size > PRINT_INTENT_BATCH_PRINTER_LIMIT) throw new PrintOutboxError('invalid_intent');

  const plans = await Promise.all([...groups.values()].map(async commands => {
    const command = commands[0];
    const printerRef = db.collection('locations').doc(command.locationId).collection('printers').doc(command.printerId);
    const jobs = printerRef.collection('jobs'), queueRef = printerRef.collection('queue').doc('state');
    const [brand, location, printer, queue, rows, orders] = await Promise.all([
      tx.get(db.collection('brands').doc(command.brandId)),
      tx.get(db.collection('locations').doc(command.locationId)), tx.get(printerRef), tx.get(queueRef),
      tx.get(jobs.limit(PRINT_QUEUE_LIMIT + 1)),
      Promise.all(commands.map(c => tx.get(db.collection('orders').doc(c.orderId)))),
    ]);
    const config = storedPrinterSchema.safeParse(printer.data());
    if (!brand.exists || location.data()?.brandId !== command.brandId || !config.success
      || config.data.configuration.id !== command.printerId
      || config.data.configuration.brandId !== command.brandId || config.data.configuration.locationId !== command.locationId) {
      throw new PrintOutboxError('ineligible_intent');
    }
    for (const order of orders) {
      const saved = orderSchema.safeParse(order.data());
      const authority = settlement ? settlement.read() : null;
      const candidate = authority?.order;
      if (!saved.success || saved.data.brandId !== command.brandId || saved.data.locationId !== command.locationId
        || candidate && (candidate.id !== order.id || candidate.brandId !== saved.data.brandId || candidate.locationId !== saved.data.locationId)
        || !kitchenPrintIntentEligibility(candidate || { ...saved.data, id: order.id } as KitchenOrder, config.data.configuration).eligible) {
        throw new PrintOutboxError('ineligible_intent');
      }
    }
    const sameScope = (q: { brandId: string; locationId: string; printerId: string }) =>
      q.brandId === command.brandId && q.locationId === command.locationId && q.printerId === command.printerId;
    const current = queueSchema.safeParse(queue.data());
    // No orderBy: missing fields must not disappear from the authoritative scan.
    if (rows.size > PRINT_QUEUE_LIMIT) throw new PrintOutboxError('queue_unverified');
    const now = Date.now();
    if (!Number.isSafeInteger(now) || now <= 0) throw new PrintOutboxError('queue_unverified');
    let oldestAt: number | null = null;
    const existing = new Map<string, z.infer<typeof jobSchema>>();
    for (const row of rows.docs) {
      const stored = jobSchema.safeParse(row.data());
      if (!stored.success || !sameScope(stored.data) || stored.data.id !== row.id
        || printJobId(stored.data) !== row.id || stored.data.createdAt <= 0 || stored.data.createdAt > now) {
        throw new PrintOutboxError('queue_unverified');
      }
      oldestAt = oldestAt === null ? stored.data.createdAt : Math.min(oldestAt, stored.data.createdAt);
      existing.set(row.id, stored.data);
    }
    if ((!queue.exists && rows.size !== 0) || (queue.exists && (!current.success || !sameScope(current.data)))
      || (current.success && (current.data.pendingCount !== rows.size || current.data.oldestPendingAt !== oldestAt))) {
      throw new PrintOutboxError('queue_unverified');
    }
    const prepared = commands.map(c => {
      const identity = { ...c, revision: 0 as const }, jobId = printJobId(identity);
      const prior = existing.get(jobId);
      if (settlement && (settlement.requireExistingJobs || prior)) {
        const target = settlement.manifestTargets.find(target => target.printerId === c.printerId);
        if (!prior || !target || prior.printerRevision !== target.printerRevision
          || prior.printerRevision !== config.data.revision) throw new PrintOutboxError('job_conflict');
      }
      if (prior && settlement?.freshOnly) throw new PrintOutboxError('job_conflict');
      if (prior && (!current.success || prior.orderId !== c.orderId || prior.kind !== c.kind)) {
        throw new PrintOutboxError('job_conflict');
      }
      return { jobId, created: !prior, identity };
    });
    const additions = prepared.filter(p => p.created);
    const revision = current.success ? current.data.revision : 0;
    if (additions.length && (revision === Number.MAX_SAFE_INTEGER || rows.size + additions.length > PRINT_QUEUE_LIMIT)) {
      throw new PrintOutboxError('queue_unverified');
    }
    return { prepared, additions, jobs, queueRef, queueExists: queue.exists,
      revision, pendingCount: rows.size, oldestAt, now, printerRevision: config.data.revision, command };
  }));
  const createdCount = plans.reduce((n, p) => n + p.additions.length, 0);
  const writeCount = createdCount + plans.filter(p => p.additions.length).length;
  if (writeCount + parsed.data.reservedWriteCount > PRINT_TRANSACTION_WRITE_LIMIT) {
    throw new PrintOutboxError('write_budget_exceeded');
  }
  const results = new Map(plans.flatMap(p => p.prepared.map(({ jobId, created }) => [jobId, { jobId, created }] as const)));
  let applied = false;
  return {
    jobs: [...unique.keys()].map(jobId => results.get(jobId)!), createdCount, writeCount,
    apply() {
      if (applied) throw new PrintOutboxError('job_conflict');
      if (settlement) settlement.read(true);
      if (!writeCount) return;
      applied = true;
      for (const plan of plans) {
        if (!plan.additions.length) continue;
        for (const { identity, jobId } of plan.additions) {
          tx.create(plan.jobs.doc(jobId), { schemaVersion: 1, ...identity, id: jobId,
            printerRevision: plan.printerRevision, state: 'queued', attempts: 0,
            createdAt: plan.now, updatedAt: FieldValue.serverTimestamp() });
        }
        const next = { schemaVersion: 1, brandId: plan.command.brandId, locationId: plan.command.locationId,
          printerId: plan.command.printerId, revision: plan.revision + 1,
          pendingCount: plan.pendingCount + plan.additions.length,
          oldestPendingAt: plan.oldestAt === null ? plan.now : Math.min(plan.oldestAt, plan.now),
          updatedAt: FieldValue.serverTimestamp() };
        if (plan.queueExists) tx.set(plan.queueRef, next); else tx.create(plan.queueRef, next);
      }
    },
  };
}

/** Backwards-compatible single-intent facade. As before, call at most ONCE per
 * printer/transaction. Multi-intent callers must use the combined batch API and
 * reserve their other writes; independently prepared ledgers are not composable.
 */
export async function prepareOriginalPrintIntent(db: Firestore, tx: Transaction, input: unknown) {
  const plan = await prepareOriginalPrintIntents(db, tx, { intents: [input], reservedWriteCount: 0 });
  return { ...plan.jobs[0], apply: plan.apply };
}
