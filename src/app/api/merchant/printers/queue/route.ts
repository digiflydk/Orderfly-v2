import { AuthorityError } from '@/lib/access/authority';
import { verifiedOrderflyIdentity, requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { PrinterQueueReadError, readPrinterQueueSummary } from '@/lib/printing/queue-summary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' },
});

export async function GET(request: Request) {
  try {
    await verifiedOrderflyIdentity();
    await requirePlatformSuperuser();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return reply({ error: 'invalid_request' }, 400);
    return reply(await readPrinterQueueSummary(Object.fromEntries(params)));
  } catch (error) {
    if (error instanceof AuthorityError && [401, 403].includes(error.status)) {
      return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status);
    }
    if (error instanceof PrinterQueueReadError) return reply({ error: error.code }, error.status);
    return reply({ error: 'queue_unavailable' }, 503);
  }
}
