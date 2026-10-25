import 'server-only';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { getOrigin } from '@/lib/url';
import { controlBrandAutomaticPrint } from './brand-automatic-print';
import { AutomaticPrintError } from './brand-automatic-print-schema';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
export async function handleBrandAutomaticPrint(request: Request) {
  try {
    await requirePlatformSuperuser();
    const url = new URL(request.url);
    if (request.method === 'GET') {
      if ([...url.searchParams.keys()].join(',') !== 'brandId') return reply({ error: 'automatic_print_invalid' }, 400);
      return reply(await controlBrandAutomaticPrint({ brandId: url.searchParams.get('brandId') }));
    }
    if (request.method !== 'POST') return reply({ error: 'automatic_print_invalid' }, 405);
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    if (url.search || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')
      || (request.headers.get('content-encoding') !== null && request.headers.get('content-encoding') !== 'identity')) return reply({ error: 'automatic_print_invalid' }, 400);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: 'automatic_print_invalid' }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > 2048) { void reader.cancel().catch(() => {}); return reply({ error: 'automatic_print_invalid' }, 400); } chunks.push(value);
    } } finally { reader.releaseLock(); }
    let input; try { input = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { return reply({ error: 'automatic_print_invalid' }, 400); }
    return reply(await controlBrandAutomaticPrint(input, true));
  } catch (error) {
    if (error instanceof AuthorityError) return reply({ error: error.status === 401 ? 'unauthorized' : error.status === 403 ? 'forbidden' : 'automatic_print_unavailable' }, error.status === 401 ? 401 : error.status === 403 ? 403 : 503);
    if (error instanceof AutomaticPrintError) return reply({ error: error.code }, error.status);
    return reply({ error: 'automatic_print_unavailable' }, 503);
  }
}
