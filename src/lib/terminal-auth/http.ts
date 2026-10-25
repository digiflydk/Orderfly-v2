import 'server-only';
import { cookies } from 'next/headers';
import { AuthorityError } from '@/lib/access/authority';
import { getOrigin } from '@/lib/url';
import {
  TERMINAL_COOKIE, TERMINAL_COOKIE_MAX_AGE, TerminalAuthError, getTerminalSession, loginTerminal, logoutTerminal,
  publicTerminalSession, readTerminalLoginConfig, updateTerminalLoginConfig,
} from './core';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
function withCookie(response: Response, token: string, maxAge = TERMINAL_COOKIE_MAX_AGE) {
  // No Domain attribute: sibling brand hosts cannot shadow this host-only cookie.
  response.headers.append('Set-Cookie', `${TERMINAL_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
  return response;
}
const invalid = (): never => { throw new TerminalAuthError('terminal_auth_invalid', 400); };
async function body(request: Request): Promise<unknown> {
  const expectedOrigin = await getOrigin();
  let origin: URL;
  try { origin = new URL(expectedOrigin); } catch { throw new AuthorityError('unavailable', 503); }
  const localDevelopment = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.protocol !== 'https:' && !localDevelopment) throw new AuthorityError('unavailable', 503);
  if (request.headers.get('origin') !== origin.origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new AuthorityError('forbidden');
  if (new URL(request.url).search || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')
    || ![null, 'identity'].includes(request.headers.get('content-encoding'))) return invalid();
  const reader = request.body?.getReader(); if (!reader) return invalid();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) { void reader.cancel().catch(() => {}); return invalid(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { return invalid(); }
}
function empty(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 0) return invalid();
}
function failure(error: unknown): Response {
  const status = error instanceof AuthorityError || error instanceof TerminalAuthError ? error.status : 503;
  const code = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 400 ? 'terminal_auth_invalid'
    : status === 409 ? 'terminal_auth_conflict' : status === 429 ? 'terminal_auth_throttled' : 'terminal_auth_unavailable';
  const message = status === 401 ? 'Login kunne ikke bekræftes.' : status === 403 ? 'Du har ikke adgang til denne handling.'
    : status === 400 ? 'Kontrollér de indtastede oplysninger.' : status === 409 ? 'Opsætningen er ændret, eller brugernavnet er ikke tilgængeligt. Genindlæs og prøv igen.'
      : status === 429 ? 'For mange loginforsøg. Vent og prøv igen.' : 'Handlingen kunne ikke gennemføres. Prøv igen.';
  const response = reply({ error: code, message }, [400, 401, 403, 409, 429].includes(status) ? status : 503);
  if (status === 429) response.headers.set('Retry-After', '900');
  return response;
}
export async function handleTerminalLogin(request: Request) {
  try {
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    const result = await loginTerminal(await body(request));
    return withCookie(reply(publicTerminalSession(result.session)), result.token);
  } catch (error) { return failure(error); }
}
export async function handleTerminalSession(request: Request) {
  try {
    if (request.method !== 'GET' && request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    if (request.method === 'POST') empty(await body(request));
    else if (new URL(request.url).search) return invalid();
    const session = await getTerminalSession(); if (!session) throw new AuthorityError('unauthorized', 401);
    const response = reply(publicTerminalSession(session));
    if (request.method === 'POST') {
      const token = (await cookies()).get(TERMINAL_COOKIE)?.value;
      if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AuthorityError('unauthorized', 401);
      return withCookie(response, token);
    }
    return response;
  } catch (error) { return failure(error); }
}
export async function handleTerminalLogout(request: Request) {
  try {
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    empty(await body(request)); await logoutTerminal();
    return withCookie(reply({ success: true }), '', 0);
  } catch (error) { return failure(error); }
}
export async function handleTerminalConfig(request: Request, locationId: string) {
  try {
    if (request.method === 'GET') {
      if (new URL(request.url).search) return invalid();
      return reply(await readTerminalLoginConfig(locationId));
    }
    if (request.method === 'PUT') return reply(await updateTerminalLoginConfig(locationId, await body(request)));
    return reply({ error: 'method_not_allowed' }, 405);
  } catch (error) { return failure(error); }
}
