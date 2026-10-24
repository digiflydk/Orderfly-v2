import 'server-only';
import { AuthorityError } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getOrigin } from '@/lib/url';
import { connectionSetupSchema, createPrinterConnection, ConnectionSetupError } from './connection-setup';
const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
export async function postPrinterConnection(request: Request) {
  try {
    await requirePlatformSuperuser();
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    if (request.method !== 'POST' || new URL(request.url).search || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return reply({ error: 'invalid_request' }, 400);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: 'invalid_request' }, 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) { const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength; if (bytes > 4096) { void reader.cancel().catch(() => undefined); return reply({ error: 'invalid_request' }, 400); } chunks.push(chunk.value); }
    let command;
    try { command = connectionSetupSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
    catch { return reply({ error: 'invalid_request' }, 400); }
    const result = await createPrinterConnection(command);
    // Deliberate one-time plaintext response, never generic object serialization.
    return reply({ item: result.item, username: result.username, secret: result.secret }, 201);
  } catch (error) {
    if (error instanceof AuthorityError) return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status);
    if (error instanceof ConnectionSetupError) return reply({ error: error.code }, error.status);
    return reply({ error: 'setup_unavailable' }, 503);
  }
}
