import { z } from 'zod';
import { AuthorityError } from '@/lib/access/authority';
import { getOrigin } from '@/lib/url';
import { settleTerminalPickupOrder } from '@/lib/server/settle-checkout';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ orderId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), method: z.enum(['cash', 'card']) }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
const fail = (error: string, message: string, status: number) => reply({ success: false, error, message }, status);
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return fail('forbidden', 'Du har ikke adgang til denne handling.', 403);
    if (new URL(request.url).search || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')
      || ![null, 'identity'].includes(request.headers.get('content-encoding'))) return fail('terminal_payment_invalid', 'Ugyldig betalingsregistrering.', 400);
    const reader = request.body?.getReader(); if (!reader) return fail('terminal_payment_invalid', 'Ugyldig betalingsregistrering.', 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength;
        if (bytes > 4096) { void reader.cancel().catch(() => {}); return fail('terminal_payment_invalid', 'Ugyldig betalingsregistrering.', 400); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { return fail('terminal_payment_invalid', 'Ugyldig betalingsregistrering.', 400); }
    const parsed = schema.safeParse(input); if (!parsed.success) return fail('terminal_payment_invalid', 'Ugyldig betalingsregistrering.', 400);
    const changed = await settleTerminalPickupOrder(parsed.data.orderId, parsed.data.method);
    return reply({ success: true, changed, message: changed ? 'Betalingen er registreret.' : 'Betalingen er allerede registreret.' });
  } catch (error) {
    if (error instanceof AuthorityError) return fail(error.status === 401 ? 'unauthorized' : error.status === 503 ? 'terminal_payment_unavailable' : 'forbidden',
      error.status === 401 ? 'Log ind igen for at fortsætte.' : error.status === 503 ? 'Betalingsstatus kunne ikke bekræftes. Opdatér ordren før næste handling.' : 'Du har ikke adgang til denne ordre.', error.status === 401 || error.status === 503 ? error.status : 403);
    const knownRejections = ['Ugyldig betalingsregistrering.', 'Kun afhentningsordrer med betaling i restaurant kan registreres her.', 'Ordren er ikke en godkendt ubetalt afhentningsordre.', 'Canceled order cannot be fulfilled'];
    if (error instanceof Error && knownRejections.includes(error.message)) return fail('terminal_payment_conflict', 'Ordren kan ikke registreres betalt i denne tilstand. Opdatér ordreoversigten.', 409);
    return fail('terminal_payment_unavailable', 'Betalingsstatus kunne ikke bekræftes. Opdatér ordren, før du prøver igen.', 503);
  }
}
