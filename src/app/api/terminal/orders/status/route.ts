import { AuthorityError } from '@/lib/access/authority';
import { getOrigin } from '@/lib/url';
import { progressTerminalOrder, TerminalStatusError } from '@/lib/orders/terminal-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
const failure = (error: string, message: string, status: number) => reply({ success: false, error, message }, status);

export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return failure('forbidden', 'Du har ikke adgang til denne handling.', 403);
    if (new URL(request.url).search || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')
      || ![null, 'identity'].includes(request.headers.get('content-encoding'))) return failure('terminal_status_invalid', 'Ugyldig ordrehandling.', 400);
    const reader = request.body?.getReader();
    if (!reader) return failure('terminal_status_invalid', 'Ugyldig ordrehandling.', 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 4096) { void reader.cancel().catch(() => {}); return failure('terminal_status_invalid', 'Ugyldig ordrehandling.', 400); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { return failure('terminal_status_invalid', 'Ugyldig ordrehandling.', 400); }
    return reply(await progressTerminalOrder(input, 'terminal'));
  } catch (error) {
    if (error instanceof AuthorityError) {
      if (error.status === 401) return failure('unauthorized', 'Log ind igen for at fortsætte.', 401);
      if (error.status === 503) return failure('terminal_status_unavailable', 'Ordren kunne ikke opdateres. Prøv igen med samme handling.', 503);
      return failure('forbidden', 'Du har ikke adgang til denne ordre.', 403);
    }
    if (error instanceof TerminalStatusError) return failure(error.code,
      error.code === 'terminal_payment_required' ? 'Registrér betalingen, før ordren kan afsluttes.'
        : error.code === 'terminal_status_conflict' ? 'Ordren er ændret. Opdatér oversigten, og prøv igen.' : 'Ugyldig ordrehandling.', error.status);
    return failure('terminal_status_unavailable', 'Ordren kunne ikke opdateres. Prøv igen med samme handling.', 503);
  }
}
