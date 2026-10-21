import { AuthorityError } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { PrinterReadError, readPrinterConfigurations } from '@/lib/printing/reads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' },
});

export async function GET(request: Request) {
  try {
    await verifiedOrderflyIdentity();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) {
      return reply({ error: 'invalid_request' }, 400);
    }
    return reply(await readPrinterConfigurations(Object.fromEntries(params)));
  } catch (error) {
    if (error instanceof AuthorityError) {
      return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status === 401 ? 401 : 403);
    }
    if (error instanceof PrinterReadError) return reply({ error: error.code }, error.status);
    return reply({ error: 'printers_unavailable' }, 503);
  }
}
