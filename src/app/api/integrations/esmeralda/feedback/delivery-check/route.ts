import { isValidMachineSecret } from '@/lib/integrations/esmeralda-customer-contract';
import { bookingDeliveryDecision, bookingDeliveryInput } from '@/lib/feedback/booking-delivery';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  if (!isValidMachineSecret(process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET, request.headers.get('x-esmeralda-integration-secret'))) return reply({ error: 'unauthorized' }, 401);
  let payload: unknown;
  try { const raw = await request.text(); if (raw.length > 2048) return reply({ error: 'invalid_payload' }, 400); payload = JSON.parse(raw); }
  catch { return reply({ error: 'invalid_payload' }, 400); }
  const parsed = bookingDeliveryInput.safeParse(payload);
  if (!parsed.success) return reply({ error: 'invalid_payload' }, 400);
  try { return reply(await bookingDeliveryDecision(parsed.data)); }
  catch { return reply({ error: 'delivery_check_unavailable' }, 503); }
}
