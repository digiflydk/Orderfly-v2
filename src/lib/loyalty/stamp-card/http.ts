import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { orderflySession } from '@/lib/access/orderfly-session';
import { getOrigin } from '@/lib/url';
import { LoyaltyError, type CounterActor } from './counter';

const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new LoyaltyError('invalid_request', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new LoyaltyError('invalid_request', 400);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new LoyaltyError('invalid_request', 400); }
}

// Merchant stamp-card endpoints: same-origin JSON only, a verified employee
// session (re-validated natively on every request, so deactivated staff fail),
// and the permission is checked again inside each transaction.
export async function merchantRoute<S extends z.ZodTypeAny>(request: Request, schema: S,
  run: (db: FirebaseFirestore.Firestore, actor: CounterActor, input: z.infer<S>, now: number) => Promise<object>) {
  if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site'
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return reply({ error: 'forbidden' }, 403);
  try {
    const session = await orderflySession();
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return reply({ error: 'invalid_request' }, 400);
    return reply(await run(getAdminDb(), { identity: session.identity, name: session.name }, parsed.data, Date.now()));
  } catch (error) {
    if (error instanceof LoyaltyError) return reply({ error: error.code }, error.status);
    if (error instanceof AuthorityError) return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status === 401 ? 401 : 403);
    // An unknown failure may follow a commit; the client retries with the same idempotency key.
    return reply({ error: 'unavailable' }, 503);
  }
}
