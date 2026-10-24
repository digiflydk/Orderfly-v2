import { handleCloudPrntPollHttp } from '@/lib/printing/cloudprnt-poll-http';
import { admitCloudPrntPoll } from '@/lib/printing/cloudprnt-poll-admission';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PollRouteContext = {
  params: Promise<{ brandId: string; locationId: string; printerId: string }>;
};

/** Path identifiers select native scope; only fresh native credentials authenticate it. */
export async function POST(request: Request, context: PollRouteContext): Promise<Response> {
  let release: (() => void) | null = null;
  try {
    release = admitCloudPrntPoll(request.headers.get('authorization'));
    if (!release) return Response.json({ error: 'poll_rate_limited' }, { status: 429,
      headers: { 'Cache-Control': 'no-store', Vary: 'Authorization', 'Retry-After': '5' } });
    // Pass the actual route parameters to the existing strict scope validator. Never
    // read scope from poll JSON, query strings, device headers or earlier sessions.
    const contact = await handleCloudPrntPollHttp(request.clone(), await context.params, 'live');
    if (!contact.ok || process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED !== 'true') return contact;
    // Reuse this request admission; output repeats native authentication.
    const { handleOrdinaryPrintHttp } = await import('@/lib/printing/ordinary-print-http');
    return await handleOrdinaryPrintHttp(request, context.params, true);
  } catch {
    return Response.json({ error: 'invalid_poll_request' }, { status: 400,
      headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
  } finally { release?.(); }
}

export async function GET(request: Request, context: PollRouteContext): Promise<Response> {
  const { handleOrdinaryPrintHttp } = await import('@/lib/printing/ordinary-print-http');
  return handleOrdinaryPrintHttp(request, context.params);
}
export async function DELETE(request: Request, context: PollRouteContext): Promise<Response> {
  const { handleOrdinaryPrintHttp } = await import('@/lib/printing/ordinary-print-http');
  return handleOrdinaryPrintHttp(request, context.params);
}
export async function HEAD(): Promise<Response> {
  return new Response(null, { status: 405, headers: { Allow: 'POST, GET, DELETE', 'Cache-Control': 'no-store' } });
}
