import 'server-only';
import { z } from 'zod';
import { AuthorityError } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getOrigin } from '@/lib/url';
import { PrinterDeviceCredentialWriteError, writePrinterDeviceCredential } from './device-credentials-service';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().positive().safe();
const commandSchema = z.object({ operation: z.enum(['issue', 'rotate', 'revoke']), brandId: id, locationId: id,
  printerId: id, printerRevision: revision, credentialRevision: z.number().int().nonnegative().safe() }).strict();
const resultSchema = z.object({ brandId: id, locationId: id, printerId: id, printerRevision: revision,
  credentialRevision: revision, revoked: z.boolean(), dispatchAuthorized: z.literal(false), activationAuthorized: z.literal(false),
  secret: z.string().length(43).regex(/^[A-Za-z0-9_-]+$/).optional() }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' },
});
const unavailable = () => reply({ error: 'credentials_unavailable' }, 503);
function failure(error: unknown) {
  try {
    if (error instanceof AuthorityError && [401, 403].includes(error.status)) {
      return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status);
    }
    if (error instanceof PrinterDeviceCredentialWriteError) {
      const statuses = { invalid_request: 400, writes_unavailable: 503, not_found: 404, record_conflict: 409, credentials_unavailable: 503 };
      if (Object.hasOwn(statuses, error.code) && statuses[error.code] === error.status) return reply({ error: error.code }, error.status);
    }
  } catch { /* Untrusted driver errors must not leak through reflection. */ }
  return unavailable();
}
function projectedResult(input: unknown, command: z.infer<typeof commandSchema>) {
  // The service deliberately makes its one-time secret nonenumerable. Read only
  // own value descriptors, then explicitly validate/project this private response.
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw Error('invalid_result');
  const allowed = ['brandId', 'locationId', 'printerId', 'printerRevision', 'credentialRevision', 'revoked', 'dispatchAuthorized', 'activationAuthorized', 'secret'];
  const keys = Reflect.ownKeys(input), row: Record<string, unknown> = {};
  if (keys.length > allowed.length) throw Error('invalid_result');
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.includes(key)) throw Error('invalid_result');
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) throw Error('invalid_result');
    row[key] = descriptor.value;
  }
  const result = resultSchema.parse(row), revoked = command.operation === 'revoke';
  if (result.brandId !== command.brandId || result.locationId !== command.locationId || result.printerId !== command.printerId
    || result.printerRevision !== command.printerRevision || result.credentialRevision !== command.credentialRevision + 1
    || result.revoked !== revoked || (revoked ? Object.hasOwn(row, 'secret') : !result.secret)
    || (result.secret !== undefined && Buffer.from(result.secret, 'base64url').toString('base64url') !== result.secret)) throw Error('invalid_result');
  return { brandId: result.brandId, locationId: result.locationId, printerId: result.printerId,
    printerRevision: result.printerRevision, credentialRevision: result.credentialRevision, revoked,
    dispatchAuthorized: false, activationAuthorized: false, ...(revoked ? {} : { secret: result.secret }) };
}

/** Authenticated administration only. No device auth, activation or print output. */
export async function postPrinterDeviceCredential(request: Request): Promise<Response> {
  try {
    await requirePlatformSuperuser(); // Before URL, headers, body or service access.
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.search || url.username || url.password
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return reply({ error: 'invalid_request' }, 400);
    const reader = request.body?.getReader(), chunks: Uint8Array[] = [];
    if (!reader) return reply({ error: 'invalid_request' }, 400);
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { try { await reader.cancel(); } catch { /* Bounds still reject. */ } return reply({ error: 'invalid_request' }, 400); }
      chunks.push(value);
    }
    let command: z.infer<typeof commandSchema>;
    try {
      command = commandSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
      if ((command.operation === 'issue') !== (command.credentialRevision === 0)
        || command.credentialRevision === Number.MAX_SAFE_INTEGER) return reply({ error: 'invalid_request' }, 400);
    } catch { return reply({ error: 'invalid_request' }, 400); }
    const result = await writePrinterDeviceCredential(command); // Exactly one invocation.
    return reply(projectedResult(result, command), command.operation === 'issue' ? 201 : 200);
  } catch (error) { return failure(error); }
}
