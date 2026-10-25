import 'server-only';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { getOrigin } from '@/lib/url';
import { manualPrintCommandSchema, ManualPrintError } from './manual-print-schema';
import { readManualPrint, requestManualPrint } from './manual-print-request';

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
});
export async function handleManualPrintControl(request: Request) {
  try {
    await requirePlatformSuperuser();
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const keys = [...url.searchParams.keys()], expected = ['orderId', 'brandId', 'locationId', 'printerId', 'printerRevision', 'kind', 'requestId'];
      if (keys.length !== expected.length || new Set(keys).size !== keys.length || keys.some(key => !expected.includes(key))) return reply({ error: 'manual_print_invalid' }, 400);
      const raw = Object.fromEntries(url.searchParams);
      if (!/^[1-9][0-9]{0,15}$/.test(raw.printerRevision || '')) return reply({ error: 'manual_print_invalid' }, 400);
      const parsed = manualPrintCommandSchema.safeParse({ ...raw, printerRevision: Number(raw.printerRevision) });
      if (!parsed.success) return reply({ error: 'manual_print_invalid' }, 400);
      return reply(await readManualPrint(parsed.data));
    }
    if (request.method !== 'POST') return reply({ error: 'manual_print_invalid' }, 405);
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    if (url.search || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')
      || (request.headers.get('content-encoding') !== null && request.headers.get('content-encoding') !== 'identity')) return reply({ error: 'manual_print_invalid' }, 400);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'manual_print_invalid' }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > 4096) { void reader.cancel().catch(() => {}); return reply({ error: 'manual_print_invalid' }, 400); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let command;
    try { command = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { return reply({ error: 'manual_print_invalid' }, 400); }
    const parsed = manualPrintCommandSchema.safeParse(command);
    if (!parsed.success) return reply({ error: 'manual_print_invalid' }, 400);
    return reply(await requestManualPrint(parsed.data));
  } catch (error) {
    if (error instanceof AuthorityError) return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status === 401 ? 401 : 403);
    if (error instanceof ManualPrintError) return reply({ error: error.code }, error.code === 'manual_print_invalid' ? 400 : error.code === 'manual_print_conflict' ? 409 : 503);
    return reply({ error: 'manual_print_unavailable' }, 503);
  }
}
