import 'server-only';
import { requireEmptyCloudPrntBody } from './cloudprnt-empty-body';
import { createHash } from 'node:crypto';
import { admitCloudPrntPoll } from './cloudprnt-poll-admission';
import { CloudPrntHttpAuthenticationError } from './cloudprnt-http-auth';
import { CLOUDPRNT_MAX_POLL_BYTES, validCloudPrntPollQuery, parseCloudPrntPoll, parseCloudPrntJobQuery,
  parseCloudPrntConfirmation } from './cloudprnt-http';
import { OrdinaryPrintError, pollOrdinaryPrint, downloadOrdinaryPrint,
  recordOrdinaryPrintResult } from './ordinary-print-native';
import { OrdinaryOutputPolicyError } from './ordinary-output-policy';

const invalid = (): never => { throw new Error('invalid_order_print_request'); };
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
function nativeScope(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return invalid();
  const fields = ['brandId', 'locationId', 'printerId'];
  if (Reflect.ownKeys(input).length !== 3 || Reflect.ownKeys(input).some(k => typeof k !== 'string' || !fields.includes(k))) return invalid();
  const values = fields.map(k => {
    const d = Object.getOwnPropertyDescriptor(input, k);
    if (!d || !('value' in d) || !id(d.value)) return invalid();
    return d.value as string;
  });
  return { brandId: values[0], locationId: values[1], printerId: values[2] };
}
function reply(status: number, body: object, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization',
    ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Orderfly CloudPRNT", charset="UTF-8"' } : {}), ...extra } });
}
async function poll(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.length > 64 || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) return invalid();
  const encoding = request.headers.get('content-encoding');
  if (encoding !== null && encoding !== 'identity') return invalid();
  const length = request.headers.get('content-length');
  if (length !== null && (length.length > 4 || !/^(0|[1-9][0-9]{0,3})$/.test(length)
    || Number(length) > CLOUDPRNT_MAX_POLL_BYTES)) return invalid();
  if (!request.body || request.bodyUsed) return invalid();
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) return invalid();
      bytes += chunk.value.byteLength;
      if (bytes > CLOUDPRNT_MAX_POLL_BYTES) { void reader.cancel().catch(() => undefined); return invalid(); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (length !== null && bytes !== Number(length)) return invalid();
    return parseCloudPrntPoll(text, contentType);
  } finally { reader.releaseLock(); }
}
const token = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
  && Buffer.from(value, 'base64url').toString('base64url') === value;

/** Supervised real-order test window. Ordinary production output stays disabled;
 * every operation checks the current scoped window and device credentials. */
export async function handleOrdinaryPrintHttp(request: Request, params: Promise<unknown>, admitted = false): Promise<Response> {
  let release: (() => void) | null = null, nativeStarted = false;
  try {
    if (!['POST', 'GET', 'DELETE'].includes(request.method)) return reply(405, {}, { Allow: 'POST, GET, DELETE' });
    release = admitted ? () => {} : admitCloudPrntPoll(request.headers.get('authorization'));
    if (!release) return reply(429, { error: 'order_print_rate_limited' }, { 'Retry-After': '5' });
    const scope = nativeScope(await params), url = new URL(request.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return invalid();
    const authorization = request.headers.get('authorization');
    if (!authorization || authorization.length > 256 || !/^Basic +[A-Za-z0-9+/]{70}==$/i.test(authorization)) {
      return reply(401, { error: 'device_unverified' });
    }
    const command = { ...scope, authorization };
    if (request.method === 'POST') {
      if (!validCloudPrntPollQuery(url.search)) return invalid();
      const parsed = await poll(request);
      const ready = parsed.status.kind === 'online' && parsed.printingInProgress !== true && parsed.jobToken === null;
      nativeStarted = true;
      const result = await pollOrdinaryPrint({ ...command, ready });
      if (!('jobReady' in result)) throw new OrdinaryPrintError('ordinary_print_unavailable');
      if (result.jobReady === false) return reply(200, { jobReady: false });
      if (!('jobToken' in result) || !token(result.jobToken)
        || !('mediaTypes' in result) || JSON.stringify(result.mediaTypes) !== '["image/png"]') {
        throw new OrdinaryPrintError('ordinary_print_unavailable');
      }
      return reply(200, { jobReady: true, mediaTypes: ['image/png'], jobToken: result.jobToken, deleteMethod: 'DELETE' });
    }
    await requireEmptyCloudPrntBody(request);
    if (request.method === 'GET') {
      const query = parseCloudPrntJobQuery(url.search);
      if (!token(query.token) || (query.mediaType !== null && query.mediaType !== 'image/png')) return invalid();
      nativeStarted = true;
      const result = await downloadOrdinaryPrint({ ...command, token: query.token });
      if (!('payload' in result) || !Buffer.isBuffer(result.payload) || result.payload.length < 8 || result.payload.length > 524_288
        || !('contentType' in result) || result.contentType !== 'image/png' || !('sha256' in result)
        || result.sha256 !== createHash('sha256').update(result.payload).digest('hex')) throw new OrdinaryPrintError('ordinary_print_unavailable');
      return new Response(new Uint8Array(result.payload), { status: 200, headers: {
        'Content-Type': 'image/png', 'Content-Length': String(result.payload.length),
        'Cache-Control': 'no-store', Vary: 'Authorization', 'X-Content-Type-Options': 'nosniff' } });
    }
    const query = parseCloudPrntConfirmation(url.search);
    if (!token(query.token)) return invalid();
    nativeStarted = true;
    await recordOrdinaryPrintResult({ ...command, query: url.search });
    return reply(200, {});
  } catch (error) {
    if (error instanceof CloudPrntHttpAuthenticationError) return error.code === 'device_unavailable'
      ? reply(503, { error: 'ordinary_print_unavailable' }) : reply(401, { error: 'device_unverified' });
    // Native polling authenticates the device before checking its scoped window.
    // Missing/inactive windows mean no eligible work. GET/DELETE remain strict.
    if (error instanceof OrdinaryOutputPolicyError) return request.method === 'POST'
      ? reply(200, { jobReady: false }) : reply(409, { error: 'order_test_unavailable' });
    if (error instanceof OrdinaryPrintError) return reply(error.code === 'ordinary_print_unavailable' ? 503 : 409,
      { error: error.code === 'ordinary_print_unavailable' ? 'ordinary_print_unavailable' : 'ordinary_print_conflict' });
    return reply(nativeStarted ? 503 : 400, { error: nativeStarted ? 'ordinary_print_unavailable' : 'invalid_order_print_request' });
  } finally { release?.(); }
}

