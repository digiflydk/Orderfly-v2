import 'server-only';
import { z } from 'zod';
import { AuthorityError } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { PrinterCredentialMetadataError, readPrinterCredentialMetadata } from './device-credentials-metadata';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const requestSchema = z.object({ brandId: id, locationId: id, printerId: id }).strict();
const resultSchema = requestSchema.extend({ printerRevision: z.number().int().positive().safe(),
  credentialRevision: z.number().int().nonnegative().safe(), state: z.enum(['missing', 'current', 'revoked', 'stale']),
  dispatchAuthorized: z.literal(false), activationAuthorized: z.literal(false) }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
function failure(error: unknown) {
  try {
    if (error instanceof AuthorityError && [401, 403].includes(error.status)) return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status);
    if (error instanceof PrinterCredentialMetadataError) {
      const statuses = { invalid_request: 400, not_found: 404, credentials_unavailable: 503 };
      if (Object.hasOwn(statuses, error.code) && statuses[error.code] === error.status) return reply({ error: error.code }, error.status);
    }
  } catch { /* Never expose reflective/native error text. */ }
  return reply({ error: 'credentials_unavailable' }, 503);
}
export async function getPrinterCredentialMetadata(request: Request): Promise<Response> {
  try {
    await requirePlatformSuperuser();
    const url = new URL(request.url);
    if (request.method !== 'GET' || request.body !== null || url.username || url.password || Buffer.byteLength(url.search, 'utf8') > 1024
      || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return reply({ error: 'invalid_request' }, 400);
    let command: z.infer<typeof requestSchema>;
    try { command = requestSchema.parse(Object.fromEntries(url.searchParams)); } catch { return reply({ error: 'invalid_request' }, 400); }
    const result = resultSchema.parse(await readPrinterCredentialMetadata(command));
    if (result.brandId !== command.brandId || result.locationId !== command.locationId || result.printerId !== command.printerId
      || (result.state === 'missing') !== (result.credentialRevision === 0)) throw Error('invalid_result');
    return reply({ brandId: result.brandId, locationId: result.locationId, printerId: result.printerId,
      printerRevision: result.printerRevision, credentialRevision: result.credentialRevision, state: result.state,
      dispatchAuthorized: false, activationAuthorized: false });
  } catch (error) { return failure(error); }
}
