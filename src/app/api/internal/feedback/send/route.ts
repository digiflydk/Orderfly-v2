import { timingSafeEqual } from 'node:crypto';
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
  try {
    // Loyalty and QR retention failures must not fail the other heartbeat workers.
    const [feedback, orders, games, contacts, loyalty, qr, delivery] = await Promise.all([runFeedbackMailWorker(), runOrderNotificationWorker(), runGameOutbox(getAdminDb()), runMarketingWorker(getAdminDb()),
      runLoyaltyWorker(getAdminDb()).catch(() => ({ failed: true })),
      runQrRetentionWorker(getAdminDb).catch(() => ({ state: 'failed' })), runDeliveryDispatchWorker().catch(() => ({ state: 'failed' }))]);
    return Response.json({ feedback, orders, games, contacts, loyalty, qr, delivery }, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch { return Response.json({ error: 'Feedback worker unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
