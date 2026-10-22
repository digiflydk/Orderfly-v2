import { handleCloudPrntPollHttp } from '@/lib/printing/cloudprnt-poll-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PollRouteContext = {
  params: Promise<{ brandId: string; locationId: string; printerId: string }>;
};

/** Path identifiers select native scope; only fresh native credentials authenticate it. */
export async function POST(request: Request, context: PollRouteContext): Promise<Response> {
  try {
    // Pass the actual route parameters to the existing strict scope validator. Never
    // read scope from poll JSON, query strings, device headers or earlier sessions.
    return await handleCloudPrntPollHttp(request, await context.params);
  } catch {
    return Response.json({ error: 'invalid_poll_request' }, { status: 400,
      headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
  }
}
