import { handleCloudPrntPollHttp } from '@/lib/printing/cloudprnt-poll-http';
import { admitCloudPrntPoll } from '@/lib/printing/cloudprnt-poll-admission';
import { handleSyntheticPilotHttp } from '@/lib/printing/synthetic-pilot-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ brandId: string; locationId: string; printerId: string }> };
const handle = (request: Request, context: Context) => handleSyntheticPilotHttp(request, context?.params);
export async function POST(request: Request, context: Context): Promise<Response> {
  const release = admitCloudPrntPoll(request.headers.get('authorization'));
  if (!release) return Response.json({ error: 'pilot_rate_limited' }, { status: 429,
    headers: { 'Cache-Control': 'no-store', Vary: 'Authorization', 'Retry-After': '5' } });
  try {
    const contact = await handleCloudPrntPollHttp(request.clone(), await context.params, 'test');
    if (!contact.ok || process.env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED !== 'true') return contact;
    return await handleSyntheticPilotHttp(request, context.params, true);
  } catch { return Response.json({ error: 'poll_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } }); }
  finally { release(); }
}
export const GET = handle;
export const DELETE = handle;
// Next otherwise routes HEAD through GET, which could consume a one-shot download.
export const HEAD = handle;
