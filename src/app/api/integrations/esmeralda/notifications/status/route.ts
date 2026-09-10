import { isValidMachineSecret } from '@/lib/integrations/esmeralda-customer-contract';
import { mailStatusInput, readOrderMailStatus } from '@/lib/integrations/order-mail-diagnostics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  if (!isValidMachineSecret(process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET, request.headers.get('x-esmeralda-integration-secret'))) {
    return reply({ error: 'unauthorized' }, 401);
  }
  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return reply({ error: 'invalid_payload' }, 400);
    payload = JSON.parse(raw);
  } catch { return reply({ error: 'invalid_payload' }, 400); }
  const parsed = mailStatusInput.safeParse(payload);
  if (!parsed.success) return reply({ error: 'invalid_payload' }, 400);
  try {
    const result = await readOrderMailStatus(parsed.data);
    return reply(result, 'error' in result ? result.error === 'order_not_found' ? 404 : 503 : 200);
  } catch {
    // No database/provider exception text or customer data crosses this boundary.
    return reply({ error: 'diagnostics_unavailable' }, 503);
  }
}
