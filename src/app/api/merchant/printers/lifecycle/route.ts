import { AuthorityError } from '@/lib/access/authority';
import { verifiedOrderflyIdentity, requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { PrinterLifecycleError, transitionPrinter } from '@/lib/printing/lifecycle';
import { getOrigin } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Cookie' },
});

export async function POST(request: Request) {
  try {
    await verifiedOrderflyIdentity();
    await requirePlatformSuperuser();
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') {
      return reply({ error: 'forbidden' }, 403);
    }
    if (new URL(request.url).search || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      return reply({ error: 'invalid_request' }, 400);
    }
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
    return reply(await transitionPrinter(input));
  } catch (error) {
    if (error instanceof AuthorityError) {
      if (error.status === 401) return reply({ error: 'unauthorized' }, 401);
      if (error.status === 403) return reply({ error: 'forbidden' }, 403);
    }
    if (error instanceof PrinterLifecycleError) return reply({ error: error.code }, error.status);
    return reply({ error: 'printers_unavailable' }, 503);
  }
}
