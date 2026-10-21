import { AuthorityError } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { readPrinterRoutingCatalog, SavedPrinterRoutingError } from '@/lib/printing/saved-routing';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
export async function GET(request: Request) {
  try {
    await requirePlatformSuperuser();
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => query.getAll(key).length !== 1)) return reply({ error: 'invalid_request' }, 400);
    return reply(await readPrinterRoutingCatalog(Object.fromEntries(query)));
  } catch (error) {
    if (error instanceof AuthorityError && [401, 403].includes(error.status)) return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status);
    if (error instanceof SavedPrinterRoutingError) return reply({ error: error.code }, error.status);
    return reply({ error: 'routing_unavailable' }, 503);
  }
}
