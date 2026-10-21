import { AuthorityError } from '@/lib/access/authority';
import { verifiedOrderflyIdentity, requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { PrinterReadError, readPrinterConfigurations } from '@/lib/printing/reads';
import { PrinterWriteError, writePrinterConfiguration } from '@/lib/printing/writes';
import { getOrigin } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' },
});

function failure(error: unknown) {
  if (error instanceof AuthorityError) {
    if (error.status === 401) return reply({ error: 'unauthorized' }, 401);
    if (error.status === 403) return reply({ error: 'forbidden' }, 403);
  }
  if (error instanceof PrinterReadError || error instanceof PrinterWriteError) return reply({ error: error.code }, error.status);
  return reply({ error: 'printers_unavailable' }, 503);
}

export async function GET(request: Request) {
  try {
    await verifiedOrderflyIdentity();
    await requirePlatformSuperuser();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) {
      return reply({ error: 'invalid_request' }, 400);
    }
    return reply(await readPrinterConfigurations(Object.fromEntries(params)));
  } catch (error) {
    return failure(error);
  }
}

async function write(request: Request, operation: 'create' | 'edit') {
  try {
    await verifiedOrderflyIdentity();
    await requirePlatformSuperuser();
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') {
      return reply({ error: 'forbidden' }, 403);
    }
    if (new URL(request.url).search || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      return reply({ error: 'invalid_request' }, 400);
    }
    // Bound streamed bytes too; Content-Length is not a trusted body size limit.
    const reader = request.body?.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    if (!reader) return reply({ error: 'invalid_request' }, 400);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return reply({ error: 'invalid_request' }, 400); }
      chunks.push(value);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return reply({ error: 'invalid_request' }, 400); }
    return reply(await writePrinterConfiguration(operation, input), operation === 'create' ? 201 : 200);
  } catch (error) { return failure(error); }
}

export const POST = (request: Request) => write(request, 'create');
export const PATCH = (request: Request) => write(request, 'edit');
