import 'server-only';
import { getAdminDb } from '@/lib/firebase-admin';
import { CLOUDPRNT_MAX_POLL_BYTES, cloudPrntPollResponse, parseCloudPrntPoll } from './cloudprnt-http';
import { CloudPrntHttpAuthenticationError, verifyCloudPrntHttpDevice } from './cloudprnt-http-auth';

import { recordPrinterContact } from './connection-status';

class InvalidPollRequest extends Error {}
const invalid = (): never => { throw new InvalidPollRequest(); };
const validId = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
function nativeScope(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return invalid();
  const keys = Reflect.ownKeys(input), allowed = ['brandId', 'locationId', 'printerId'];
  if (keys.length !== 3 || keys.some(key => typeof key !== 'string' || !allowed.includes(key))) return invalid();
  const field = (key: string) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor) || !validId(descriptor.value)) return invalid();
    return descriptor.value as string;
  };
  return { brandId: field('brandId'), locationId: field('locationId'), printerId: field('printerId') };
}
function response(status: number, body: object) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization',
    ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Orderfly CloudPRNT", charset="UTF-8"' } : {}),
    ...(status === 405 ? { Allow: 'POST' } : {}) } });
}
async function pollBody(request: Request, expectedLength: number | null) {
  if (!request.body || request.bodyUsed) return invalid();
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) return invalid();
      bytes += chunk.value.byteLength;
      if (bytes > CLOUDPRNT_MAX_POLL_BYTES) {
        // Do not await a producer's cancellation promise before rejecting a bound violation.
        void reader.cancel().catch(() => undefined);
        return invalid();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (expectedLength !== null && bytes !== expectedLength) return invalid();
    return parseCloudPrntPoll(text, request.headers.get('content-type') ?? '');
  } finally { reader.releaseLock(); }
}

/** Internal adapter only. Trusted route code supplies native scope, never poll JSON/query.
 * Identity-only by default. HTTP routes opt into authenticated contact metadata.
 * This adapter never reads/writes queues or authorizes dispatch or print results.
 */
export async function handleCloudPrntPollHttp(request: Request, scope: unknown, contactEndpoint?: 'test' | 'live'): Promise<Response> {
  let nativeStarted = false;
  try {
    const command = nativeScope(scope);
    if (request.method !== 'POST') return response(405, { error: 'invalid_poll_request' });
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return invalid();
    const authorization = request.headers.get('authorization');
    if (!authorization || authorization.length > 256 || !/^Basic +[A-Za-z0-9+/]{70}==$/i.test(authorization)) {
      return response(401, { error: 'device_unverified' });
    }
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.length > 64 || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) return invalid();
    const encoding = request.headers.get('content-encoding');
    if (encoding !== null && encoding !== 'identity') return invalid();
    const length = request.headers.get('content-length');
    if (length !== null && (length.length > 4 || !/^(0|[1-9][0-9]{0,3})$/.test(length)
      || Number(length) > CLOUDPRNT_MAX_POLL_BYTES)) return invalid();
    const poll = await pollBody(request, length === null ? null : Number(length));
    nativeStarted = true;
    const db = getAdminDb();
    // Native SDK may call this callback again. Never capture an earlier identity result.
    await db.runTransaction(async transaction => {
      const identity = await verifyCloudPrntHttpDevice({ db, transaction }, { ...command, authorization });
      if (contactEndpoint) await recordPrinterContact(transaction, db, identity, contactEndpoint);
    }, contactEndpoint ? undefined : { readOnly: true });
    return response(200, cloudPrntPollResponse(poll));
  } catch (error) {
    if (error instanceof CloudPrntHttpAuthenticationError) {
      return error.code === 'device_unavailable'
        ? response(503, { error: 'poll_unavailable' }) : response(401, { error: 'device_unverified' });
    }
    // Parser/stream/request/reflection errors never expose request or provider values.
    return nativeStarted ? response(503, { error: 'poll_unavailable' })
      : response(400, { error: 'invalid_poll_request' });
  }
}
