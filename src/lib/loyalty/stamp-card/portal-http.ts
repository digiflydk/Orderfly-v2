import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { getOrigin } from '@/lib/url';
import { LoyaltyError } from './counter';
import { readSession, resolveBrand, type MemberSession, type ProgramBrand, type RequestContext } from './membership';

export const SESSION_COOKIE = '__Host-orderfly-loyalty';
type Db = FirebaseFirestore.Firestore;
type Params = { params: Promise<{ brandSlug: string }> };
export type PortalResult = { body: object; status?: number; setSession?: { token: string; expiresAt: number } | null };

function respond(result: PortalResult) {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
  if (result.setSession) headers.append('Set-Cookie', `${SESSION_COOKIE}=${result.setSession.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((result.setSession.expiresAt - Date.now()) / 1000))}`);
  if (result.setSession === null) headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return new Response(JSON.stringify(result.body), { status: result.status ?? 200, headers });
}

function cookie(request: Request) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return undefined;
}

// The first X-Forwarded-For hop is set by App Hosting's load balancer.
const clientIp = (request: Request) => (request.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 64) || 'unknown';

async function readJson(request: Request) {
  const text = await request.text().catch(() => { throw new LoyaltyError('invalid_request', 400); });
  if (text.length > 4096) throw new LoyaltyError('invalid_request', 400);
  try { return JSON.parse(text || '{}'); } catch { throw new LoyaltyError('invalid_request', 400); }
}

// Customer-portal endpoints. Mutations are same-origin JSON only; reads reject
// cross-site requests. Errors are codes only, with no internal detail.
export async function portalRoute<S extends z.ZodTypeAny>(request: Request, { params }: Params, options: {
  schema?: S; session?: boolean;
  run: (ctx: { db: Db; brand: ProgramBrand; input: z.infer<S>; session: MemberSession | null; context: RequestContext }) => Promise<PortalResult>;
}) {
  const mutation = request.method !== 'GET';
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (mutation && (request.headers.get('origin') !== await getOrigin()
    || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'))) return respond({ body: { error: 'forbidden' }, status: 403 });
  try {
    const db = getAdminDb(), now = Date.now();
    const brand = await resolveBrand(db, (await params).brandSlug);
    let input: unknown = undefined;
    if (options.schema) {
      const parsed = options.schema.safeParse(await readJson(request));
      if (!parsed.success) return respond({ body: { error: 'invalid_request' }, status: 400 });
      input = parsed.data;
    }
    const session = options.session ? await readSession(db, brand, cookie(request), now) : null;
    return respond(await options.run({ db, brand, input, session, context: { ip: clientIp(request), now } }));
  } catch (error) {
    if (error instanceof LoyaltyError) return respond({ body: { error: error.code }, status: error.status, setSession: error.status === 401 ? null : undefined });
    return respond({ body: { error: 'unavailable' }, status: 503 });
  }
}
