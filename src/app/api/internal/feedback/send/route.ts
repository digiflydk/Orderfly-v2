import { processDueNativeFreeCheckouts } from '@/lib/payments/native-free-recovery';
import { processWorldlineStaleCheckouts } from '@/lib/payments/worldline-stale-holds';
import { processWorldlineJobs } from '@/lib/payments/worldline-reconcile';
import { timingSafeEqual } from 'node:crypto';
import { runDullyFeedbackWorker } from '@/lib/feedback/dully-worker';
import { runFeedbackMailWorker } from '@/lib/feedback/mail-worker';
import { runOrderNotificationWorker } from '@/lib/notifications/order-worker';
import { getAdminDb } from '@/lib/firebase-admin';
import { runGameOutbox } from '@/lib/games/worker';
import { runMarketingWorker } from '@/lib/marketing/worker';
import { runLoyaltyWorker } from '@/lib/loyalty/stamp-card/worker';
import { runQrRetentionWorker } from '@/lib/qr/worker';
import { runDeliveryDispatchWorker } from '@/lib/delivery/booking/dispatcher';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  const secrets = [process.env.ORDERFLY_FEEDBACK_WORKER_SECRET, process.env.ORDERFLY_NOTIFICATION_SECRET]
    .filter((secret): secret is string => typeof secret === 'string' && secret.length >= 32);
  const value = request.headers.get('authorization') || '';
  if (value.length > 519 || !secrets.some(secret => {
    const expected = Buffer.from('Bearer ' + secret), actual = Buffer.from(value);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  })) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // Keep payment recovery inside this request's awaited lifetime even when a
  // legacy mail worker rejects. Its HTTP failure contract is preserved below.
  const paymentRecovery = Promise.all([
    processWorldlineJobs().catch(()=>({state:'failed'})),
    processWorldlineStaleCheckouts().catch(()=>({state:'failed'})),
    processDueNativeFreeCheckouts().catch(()=>({state:'failed'})),
  ]);
  try {
    const [feedback, orders, games, contacts, loyalty, qr, delivery, dully] = await Promise.all([runFeedbackMailWorker(), runOrderNotificationWorker(), runGameOutbox(getAdminDb()), runMarketingWorker(getAdminDb()),
      runLoyaltyWorker(getAdminDb()).catch(() => ({ failed: true })),
      runQrRetentionWorker(getAdminDb).catch(() => ({ state: 'failed' })), runDeliveryDispatchWorker().catch(() => ({ state: 'failed' })), runDullyFeedbackWorker().catch(() => ({ state: 'failed' }))]);
    const [worldline,worldlineStale,freeCheckouts] = await paymentRecovery;
    return Response.json({ feedback, orders, games, contacts, loyalty, qr, delivery, dully, worldline, worldlineStale, freeCheckouts }, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch { await paymentRecovery; return Response.json({ error: 'Feedback worker unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
