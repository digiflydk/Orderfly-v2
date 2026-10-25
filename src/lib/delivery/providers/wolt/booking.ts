import 'server-only';
import { createHash } from 'node:crypto';
import { buildWoltCreateRequest, createWoltDelivery, woltCreateInputSchema, type WoltCreateInput, type WoltCreateResult, type WoltWriteTransport } from './create';

export type WoltAttemptKey = {
  scope: { brandId: string; locationId: string }; orderRef: string; quoteRef: string;
  merchantOrderReferenceId: string; requestDigest: string;
};
export type WoltAttemptClaim = {
  key: WoltAttemptKey; attemptRef: string; revision: string;
  disposition: 'dispatch_once' | 'existing'; result: WoltCreateResult | null;
};
/** Implemented by the shared coordinator-owned transactional repository.
 * claimAttempt must atomically return dispatch_once to ONE caller only, preserve
 * the claim across process crashes, reject changed digests, and scope every read.
 * Network calls MUST NOT execute inside the repository transaction callback.
 */
export interface WoltAttemptRepository {
  claimAttempt(key: WoltAttemptKey): Promise<WoltAttemptClaim>;
  recordAttemptResult(claim: WoltAttemptClaim, result: WoltCreateResult): Promise<void>;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

export async function bookWoltDelivery(
  input: WoltCreateInput, orderRef: string, quoteRef: string,
  repository: WoltAttemptRepository, transport: WoltWriteTransport, now: Date,
): Promise<WoltCreateResult> {
  // Invalid and expired input cannot claim an intent or reach the provider.
  const snapshot = freezeDeep(woltCreateInputSchema.parse(input));
  const clock = new Date(now.getTime());
  const request = buildWoltCreateRequest(snapshot, clock);
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(orderRef) || !/^[A-Za-z0-9_.:-]{1,200}$/.test(quoteRef)) throw new Error('INVALID_ATTEMPT_REFERENCE');
  const key: WoltAttemptKey = freezeDeep({
    scope: snapshot.scope, orderRef, quoteRef, merchantOrderReferenceId: snapshot.merchantOrderReferenceId,
    requestDigest: createHash('sha256').update(canonical({ scope: snapshot.scope, request })).digest('hex'),
  });
  const claim = await repository.claimAttempt(key);
  if (canonical(claim.key) !== canonical(key) || !claim.attemptRef || !claim.revision) throw new Error('ATTEMPT_CLAIM_MISMATCH');
  if (claim.disposition !== 'dispatch_once') {
    return claim.result ?? { kind: 'unknown', code: 'EXISTING_ATTEMPT_UNRESOLVED', merchantOrderReferenceId: key.merchantOrderReferenceId, reconciliation: 'verified_event_or_manual' };
  }
  if (claim.result !== null) throw new Error('INVALID_DISPATCH_CLAIM');
  const result = await createWoltDelivery(snapshot, transport, clock);
  try { await repository.recordAttemptResult(claim, result); }
  catch {
    // The durable reservation remains. A crash/write conflict never authorizes
    // another courier. An accepted response can be restored by event/support.
    return { kind: 'unknown', code: 'ATTEMPT_PERSISTENCE_UNKNOWN', merchantOrderReferenceId: key.merchantOrderReferenceId, reconciliation: 'verified_event_or_manual' };
  }
  return result;
}
