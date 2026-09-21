import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AuthorityError, type VerifiedIdentity } from './authority';

// Fixed reviewed destination. Neither forms nor redirects may reroute credentials.
const endpoint = 'https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/timeclock-admin-auth';
export const OPSFLY_COOKIE_PREFIX = 'opsfly.v1.';
export const SESSION_SECONDS = 8 * 60 * 60;
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
const nativeSchema = z.object({
  identity: z.object({ provider: z.literal('opsfly'), organizationId: z.string().uuid(), subject: z.string().uuid() }).strict(),
  expires_at: z.string().datetime(),
}).strict();

export class OpsflyLoginError extends Error {
  constructor(public status: number) { super('Login could not be verified'); }
}

async function callNative(body: Record<string, unknown>, token?: string) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-session-token': token } : {}) },
      body: JSON.stringify({ ...body, organization_slug: 'esmeralda' }),
    });
  } catch { throw new OpsflyLoginError(503); }
  if (!response.ok) throw new OpsflyLoginError(response.status === 429 ? 429 : response.status >= 500 ? 503 : 403);
  // Responses contain credentials at login: never log their bodies or errors.
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    if (!reader) throw new Error();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > 8000) throw new Error(); chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new OpsflyLoginError(503); }
  finally { await reader?.cancel().catch(() => {}); }
}

export async function nativeOpsflySession(token: string) {
  if (!tokenSchema.safeParse(token).success) throw new AuthorityError('unauthorized', 401);
  const result = nativeSchema.safeParse(await callNative({ action: 'session' }, token));
  if (!result.success || Date.parse(result.data.expires_at) <= Date.now()) throw new AuthorityError('unauthorized', 401);
  return result.data;
}

export async function loginOpsfly(identifier: string, pin: string) {
  const data = await callNative({ action: 'login', identifier, pin, remember_me: false });
  if (!tokenSchema.safeParse(data?.token).success) throw new OpsflyLoginError(503);
  try {
    const verified = await nativeOpsflySession(data.token);
    return { token: data.token as string, ...verified };
  } catch (error) { await logoutOpsfly(data.token).catch(() => {}); throw error; }
}

export async function logoutOpsfly(token: string) {
  if (!tokenSchema.safeParse(token).success) throw new AuthorityError('unauthorized', 401);
  await callNative({ action: 'logout' }, token);
}

function mac(payload: string) {
  const secret = process.env.MPANEL_PLATFORM_ADMIN_SECRET;
  if (!secret || secret.length < 32) throw new OpsflyLoginError(503);
  return createHmac('sha256', secret).update('orderfly-opsfly-session:v1\0' + payload).digest();
}

export function createOpsflyCookie(token: string, expiresAt: string) {
  tokenSchema.parse(token);
  const expires = Math.min(Date.parse(expiresAt), Date.now() + SESSION_SECONDS * 1000);
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new AuthorityError('unauthorized', 401);
  const payload = Buffer.from(JSON.stringify({ token, expires })).toString('base64url');
  return { value: OPSFLY_COOKIE_PREFIX + payload + '.' + mac(payload).toString('base64url'), maxAge: Math.floor((expires - Date.now()) / 1000) };
}

export function readOpsflyCookie(value: string): string {
  try {
    if (!value.startsWith(OPSFLY_COOKIE_PREFIX) || value.length > 1000) throw new Error();
    const parts = value.slice(OPSFLY_COOKIE_PREFIX.length).split('.');
    if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const [payload, signature] = parts, received = Buffer.from(signature, 'base64url'), expected = mac(payload);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error();
    const data = z.object({ token: tokenSchema, expires: z.number().finite() }).strict().parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (data.expires <= Date.now() || data.expires > Date.now() + SESSION_SECONDS * 1000) throw new Error();
    return data.token;
  } catch { throw new AuthorityError('unauthorized', 401); }
}

export async function verifyOpsflyCookie(value: string): Promise<VerifiedIdentity> {
  // No cross-request cache: logout, PIN reset and deactivation take effect immediately.
  return (await nativeOpsflySession(readOpsflyCookie(value))).identity;
}
