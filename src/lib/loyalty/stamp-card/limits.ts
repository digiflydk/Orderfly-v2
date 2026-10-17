import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { COLLECTIONS, hashKey } from './model';

export class RateLimited extends Error {
  constructor() { super('rate_limited'); }
}

// Fixed-window counter in Firestore, read now and recorded by the returned
// writer once the caller's other reads are done. Keys are hashed, so no raw
// e-mail or IP address is stored.
export async function consumeLimit(tx: Transaction, db: Firestore, scope: string, key: string, limit: number, windowMs: number, now: number) {
  const window = Math.floor(now / windowMs);
  const ref = db.collection(COLLECTIONS.rateLimits).doc(hashKey(scope, key, String(window)));
  const count = Number((await tx.get(ref)).data()?.count || 0);
  if (count >= limit) throw new RateLimited();
  return () => tx.set(ref, { scope, count: count + 1, expiresAt: (window + 2) * windowMs });
}
