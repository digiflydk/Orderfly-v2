import 'server-only';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { getOrigin } from '@/lib/url';
import { controlOrderTestWindow, OrdinaryOutputPolicyError, orderTestScopeSchema } from './ordinary-output-policy';

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
});
export async function handleOrderTestControl(request: Request) {
  try {
    await requirePlatformSuperuser();
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const keys = [...url.searchParams.keys()];
      if (keys.length !== 5 || new Set(keys).size !== 5) return reply({ error: 'invalid_order_test' }, 400);
      const raw = Object.fromEntries(url.searchParams);
      if (!/^[1-9][0-9]{0,15}$/.test(raw.printerRevision || '') || !/^[1-9][0-9]{0,15}$/.test(raw.credentialRevision || '')) return reply({ error: 'invalid_order_test' }, 400);
      const scope = orderTestScopeSchema.safeParse({ ...raw,
        printerRevision: Number(raw.printerRevision), credentialRevision: Number(raw.credentialRevision) });
      if (!scope.success) return reply({ error: 'invalid_order_test' }, 400);
      return reply(await controlOrderTestWindow({ ...scope.data, operation: 'read' }));
    }
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    if (request.method !== 'POST' || url.search || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return reply({ error: 'invalid_order_test' }, 400);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'invalid_order_test' }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength;
        if (length > 4096) { void reader.cancel().catch(() => {}); return reply({ error: 'invalid_order_test' }, 400); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let command;
    try { command = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { return reply({ error: 'invalid_order_test' }, 400); }
    if (!command || !['start', 'startIndependent', 'stop'].includes(command.operation)) return reply({ error: 'invalid_order_test' }, 400);
    return reply(await controlOrderTestWindow(command));
  } catch (e) {
    if (e instanceof AuthorityError) return reply({ error: e.status === 401 ? 'unauthorized' : 'forbidden' }, e.status === 401 ? 401 : 403);
    if (e instanceof OrdinaryOutputPolicyError) return reply({ error: e.code }, e.code === 'invalid_order_test' ? 400 : e.code === 'order_test_conflict' ? 409 : 503);
    return reply({ error: 'order_test_unavailable' }, 503);
  }
}
