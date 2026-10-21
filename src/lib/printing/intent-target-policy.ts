import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import type { PrinterConfiguration, PrintJobKind } from './domain';
import { storedPrinterSchema } from './storage';

const identifier = z.string().max(128).regex(/^[A-Za-z0-9_-]{1,128}$/);
const scopeSchema = z.object({ brandId: identifier, locationId: identifier }).strict();
const targetSchema = z.object({
  printerId: identifier, printerRevision: z.number().int().positive().safe(),
  kinds: z.array(z.enum(['kitchen', 'packing'])).min(1).max(2),
}).strict();
const policySchema = z.object({
  schemaVersion: z.literal(1), id: z.literal('original'),
  brandId: identifier, locationId: identifier,
  revision: z.number().int().positive().safe(), deletedAt: z.null(),
  enabled: z.boolean(), targets: z.array(targetSchema).max(16),
}).strict();

export class PrintIntentPolicyError extends Error {
  constructor(readonly code: 'invalid_scope' | 'policy_unverified' | 'target_unverified' | 'policy_unavailable') {
    super(code);
  }
}

export type PreparedPrintIntentPolicy = Readonly<{
  brandId: string; locationId: string; policyRevision: number | null;
  enabled: boolean; dispatchAuthorized: false;
  targets: ReadonlyArray<Readonly<{
    configuration: Readonly<PrinterConfiguration>; printerRevision: number;
    kinds: ReadonlyArray<PrintJobKind>; dispatchAuthorized: false;
  }>>;
}>;

// Bound raw data before schema traversal/refinements, including unknown fields.
// This accepts only data properties and copies them without invoking accessors.
function boundedSnapshot(input: unknown, code: 'invalid_scope' | 'policy_unverified' | 'target_unverified'): unknown {
  let nodes = 0;
  function copy(value: unknown, depth: number): unknown {
    if (++nodes > 256 || depth > 5) throw new PrintIntentPolicyError(code);
    if (typeof value === 'string') {
      if (value.length > 400) throw new PrintIntentPolicyError(code);
      return value;
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (!value || typeof value !== 'object') throw new PrintIntentPolicyError(code);
    if (Array.isArray(value)) {
      if (value.length > 16) throw new PrintIntentPolicyError(code);
      const result: unknown[] = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !('value' in descriptor)) throw new PrintIntentPolicyError(code);
        result.push(copy(descriptor.value, depth + 1));
      }
      return result;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new PrintIntentPolicyError(code);
    const keys = Reflect.ownKeys(value);
    if (keys.length > 12) throw new PrintIntentPolicyError(code);
    const result: Record<string, unknown> = Object.create(null);
    for (const key of keys) {
      if (typeof key !== 'string' || key.length > 128) throw new PrintIntentPolicyError(code);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) throw new PrintIntentPolicyError(code);
      result[key] = copy(descriptor.value, depth + 1);
    }
    return result;
  }
  return copy(input, 0);
}

function nativeScopeRecord(snapshot: FirebaseFirestore.DocumentSnapshot, expectedId: string): Record<string, unknown> {
  const value = snapshot.data();
  if (!snapshot.exists || snapshot.id !== expectedId || !value || typeof value !== 'object'
    || (value.id !== undefined && value.id !== expectedId)
    || (value.deletedAt !== undefined && value.deletedAt !== null)
    || (value.deleted !== undefined && value.deleted !== false)
    || (value.isDeleted !== undefined && value.isDeleted !== false)) throw new PrintIntentPolicyError('policy_unverified');
  return value;
}

/** Preparation only. Caller must authenticate its trusted event/actor and use a
 * fresh context on every retry. This neither authorizes writes nor proves payment
 * or commit. No production caller, configuration mutation or dispatch is added.
 */
export async function preparePrintIntentTargetPolicy(context: NativeTransactionContext, input: unknown): Promise<PreparedPrintIntentPolicy> {
  const scope = scopeSchema.safeParse(boundedSnapshot(input, 'invalid_scope'));
  if (!scope.success) throw new PrintIntentPolicyError('invalid_scope');
  if (!context || context.db !== getAdminDb() || !context.transaction) throw new PrintIntentPolicyError('policy_unverified');
  const { db, transaction } = context;
  const { brandId, locationId } = scope.data;
  try {
    const locationRef = db.collection('locations').doc(locationId);
    const [brand, location, saved] = await Promise.all([
      transaction.get(db.collection('brands').doc(brandId)), transaction.get(locationRef),
      transaction.get(locationRef.collection('printIntentPolicies').doc('original')),
    ]);
    nativeScopeRecord(brand, brandId);
    if (nativeScopeRecord(location, locationId).brandId !== brandId) throw new PrintIntentPolicyError('policy_unverified');
    const result = (policyRevision: number | null, targets: PreparedPrintIntentPolicy['targets']): PreparedPrintIntentPolicy => Object.freeze({
      brandId, locationId, policyRevision, enabled: targets.length > 0,
      dispatchAuthorized: false as const, targets: Object.freeze(targets),
    });
    if (!saved.exists) return result(null, []); // Explicit default OFF; no fallback.
    const parsed = policySchema.safeParse(boundedSnapshot(saved.data(), 'policy_unverified'));
    if (!parsed.success || saved.id !== 'original' || parsed.data.brandId !== brandId || parsed.data.locationId !== locationId) throw new PrintIntentPolicyError('policy_unverified');
    const policy = parsed.data;
    const ids = new Set<string>();
    for (const target of policy.targets) {
      if (ids.has(target.printerId) || new Set(target.kinds).size !== target.kinds.length) throw new PrintIntentPolicyError('policy_unverified');
      ids.add(target.printerId);
    }
    // OFF policies have no latent targets; ON policies must select explicitly.
    if (policy.enabled !== (policy.targets.length > 0)) throw new PrintIntentPolicyError('policy_unverified');
    if (!policy.enabled) return result(policy.revision, []);
    const targets = await Promise.all(policy.targets.map(async target => {
      const snapshot = await transaction.get(locationRef.collection('printers').doc(target.printerId));
      const value = snapshot.data();
      // Timestamp metadata is opaque and never returned; configuration alone is
      // bounded before the existing canonical stored-record validator runs.
      if (!snapshot.exists || snapshot.id !== target.printerId || !value || typeof value !== 'object') throw new PrintIntentPolicyError('target_unverified');
      const configuration = boundedSnapshot(value.configuration, 'target_unverified');
      const stored = storedPrinterSchema.safeParse({ ...value, configuration });
      if (!stored.success || stored.data.configuration.id !== target.printerId
        || stored.data.configuration.brandId !== brandId || stored.data.configuration.locationId !== locationId
        || stored.data.revision !== target.printerRevision || stored.data.configuration.state === 'disabled') throw new PrintIntentPolicyError('target_unverified');
      return Object.freeze({ configuration: Object.freeze(stored.data.configuration), printerRevision: stored.data.revision,
        kinds: Object.freeze([...target.kinds]), dispatchAuthorized: false as const });
    }));
    return result(policy.revision, targets);
  } catch (error) {
    if (error instanceof PrintIntentPolicyError) throw error;
    throw new PrintIntentPolicyError('policy_unavailable');
  }
}
