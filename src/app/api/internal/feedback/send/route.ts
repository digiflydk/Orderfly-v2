import { timingSafeEqual } from 'node:crypto';
import { runFeedbackMailWorker } from '@/lib/feedback/mail-worker';
import { runOrderNotificationWorker } from '@/lib/notifications/order-worker';
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
    const [feedback, orders] = await Promise.all([runFeedbackMailWorker(), runOrderNotificationWorker()]);
    return Response.json({ feedback, orders }, { headers: { 'Cache-Control': 'no-store' } });
  }
  catch { return Response.json({ error: 'Feedback worker unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
