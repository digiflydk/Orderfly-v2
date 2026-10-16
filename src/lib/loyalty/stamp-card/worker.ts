import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { runLoyaltyExpiry } from './expiry';
import { runLoyaltyMailOutbox } from './mail';

// Stamp-card work in the shared worker heartbeat. Each part fails independently
// and never fails the heartbeat's other workers.
export async function runLoyaltyWorker(db: Firestore, now = Date.now()) {
  const [expiry, mail] = await Promise.all([
    runLoyaltyExpiry(db, now).catch(() => ({ failed: true })),
    runLoyaltyMailOutbox(db, now).catch(() => ({ failed: true })),
  ]);
  return { expiry, mail };
}
