import 'server-only';
import { z } from 'zod';
import { directTestCommandSchema, directTestResultSchema } from './direct-test-schema';
import { requestDirectTestPrint } from './direct-test-print';
import { AuthorityError } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getOrigin } from '@/lib/url';
import { issuePilotQualificationSession, pilotOperatorAttestationSchema, PilotQualificationError } from './pilot-qualification';
import { consumePilotQualification } from './pilot-qualification-consumption';
import { pilotStatusScopeSchema, pilotStatusResultSchema, readPrinterPilotStatus } from './pilot-status';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().positive().safe();
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const binding = { brandId: id, locationId: id, printerId: id, printerRevision: revision, credentialRevision: revision };
const flags = { outputAuthorized: z.literal(false), dispatchAuthorized: z.literal(false),
  activationAuthorized: z.literal(false), physicalCompatibilityVerified: z.literal(false) };
const commands = z.union([directTestCommandSchema.extend({ operation: z.literal('print') }).strict(), z.object({ operation: z.literal('issue'), ...binding }).strict(),
  z.object({ operation: z.literal('attest'), attestation: pilotOperatorAttestationSchema }).strict()]);
const issuedResult = z.object({ ...binding, sessionId: token, expiresAt: z.number().int().positive().safe(), nonce: token, ...flags }).strict();
const consumedResult = z.object({ ...binding, sessionId: token, jobId: token, contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  trust: z.literal('supervised_operator'), ...flags }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
const unavailable = () => reply({ error: 'qualification_unavailable' }, 503);
function project(input: unknown, allowed: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw Error('invalid_result');
  const row: Record<string, unknown> = {}, keys = Reflect.ownKeys(input);
  if (keys.length !== allowed.length) throw Error('invalid_result');
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.includes(key)) throw Error('invalid_result');
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) throw Error('invalid_result');
    row[key] = descriptor.value;
  }
  return row;
}
function failure(error: unknown) {
  try {
    if (error instanceof AuthorityError && [401, 403].includes(error.status)) return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status);
    if (error instanceof PilotQualificationError) {
      const statuses = { invalid_qualification: 400, qualification_conflict: 409, qualification_unavailable: 503 };
      if (Object.hasOwn(statuses, error.code)) return reply({ error: error.code }, statuses[error.code]);
    }
  } catch { /* Untrusted provider errors must never be reflected. */ }
  return unavailable();
}

export async function getPrinterPilotControl(request: Request): Promise<Response> {
  try {
    await requirePlatformSuperuser();
    const url = new URL(request.url), keys = Object.keys(pilotStatusScopeSchema.shape);
    if (request.method !== 'GET' || request.body || url.username || url.password
      || request.headers.get('sec-fetch-site') === 'cross-site'
      || Array.from(url.searchParams.keys()).length !== keys.length
      || keys.some(key => url.searchParams.getAll(key).length !== 1)) return reply({ error: 'invalid_qualification' }, 400);
    const values = Object.fromEntries(url.searchParams);
    if (!/^[1-9][0-9]{0,15}$/.test(values.printerRevision) || !/^[1-9][0-9]{0,15}$/.test(values.credentialRevision)) return reply({ error: 'invalid_qualification' }, 400);
    const parsed = pilotStatusScopeSchema.safeParse({ ...values, printerRevision: Number(values.printerRevision), credentialRevision: Number(values.credentialRevision) });
    if (!parsed.success) return reply({ error: 'invalid_qualification' }, 400);
    const result = pilotStatusResultSchema.parse(project(await readPrinterPilotStatus(parsed.data), Object.keys(pilotStatusResultSchema.shape)));
    if (keys.some(key => result[key as keyof typeof parsed.data] !== parsed.data[key as keyof typeof parsed.data])) return unavailable();
    return reply(result);
  } catch (error) { return failure(error); }
}

/** Protected explicit human-supervised pilot control. No device delivery or activation. */
export async function postPrinterPilotControl(request: Request): Promise<Response> {
  try {
    await requirePlatformSuperuser();
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.search || url.username || url.password
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return reply({ error: 'invalid_qualification' }, 400);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'invalid_qualification' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) { void reader.cancel().catch(() => {}); return reply({ error: 'invalid_qualification' }, 400); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let command: z.infer<typeof commands>;
    try { command = commands.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
    catch { return reply({ error: 'invalid_qualification' }, 400); }
    const keys = Object.keys(binding);
    if (command.operation === 'print') {
      const { operation: _operation, ...input } = command;
      const result = directTestResultSchema.parse(project(await requestDirectTestPrint(input), Object.keys(directTestResultSchema.shape)));
      if (keys.some(key => result[key as keyof typeof binding] !== input[key as keyof typeof binding])) throw Error('invalid_result');
      return reply(result, 201);
    }
    if (command.operation === 'issue') {
      const { operation: _operation, ...scope } = command;
      const result = issuedResult.parse(project(await issuePilotQualificationSession(scope), Object.keys(issuedResult.shape)));
      if (keys.some(key => result[key as keyof typeof binding] !== scope[key as keyof typeof binding])
        || Buffer.from(result.nonce, 'base64url').toString('base64url') !== result.nonce) throw Error('invalid_result');
      return reply(result, 201);
    }
    const result = consumedResult.parse(project(await consumePilotQualification(command.attestation), Object.keys(consumedResult.shape)));
    if (keys.some(key => result[key as keyof typeof binding] !== command.attestation[key as keyof typeof binding])
      || result.sessionId !== command.attestation.sessionId || result.jobId !== result.sessionId) throw Error('invalid_result');
    return reply(result, 201);
  } catch (error) { return failure(error); }
}
