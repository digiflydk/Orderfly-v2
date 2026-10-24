import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { runLoyaltyExpiry } from './expiry';
import { runLoyaltyMailOutbox } from './mail';
import { runSignupNotificationOutbox } from './signup-notifications';
import { runDiscountInvitationOutbox } from '../discount-card/invitation-mail';

// Stamp-card work in the shared worker heartbeat. Each part fails independently
// and never fails the heartbeat's other workers.
export async function runLoyaltyWorker(db: Firestore, now = Date.now()) {
  const [expiry, mail, signupNotifications, discountInvitations] = await Promise.all([
    runLoyaltyExpiry(db, now).catch(() => ({ failed: true })),
    runLoyaltyMailOutbox(db, now).catch(() => ({ failed: true })),
    runSignupNotificationOutbox(db, now).catch(() => ({ failed: true })),
    runDiscountInvitationOutbox(db, now).catch(() => ({ failed: true })),
  ]);
  return { expiry, mail, signupNotifications, discountInvitations };
}
