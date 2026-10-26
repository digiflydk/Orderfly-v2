import 'server-only';
import { AuthorityError } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { getOrigin } from '@/lib/url';
import { DeliverySettingsError, readDeliverySettings, writeDeliverySettings } from './server';
import { settingsScopeSchema, settingsCommandSchema, deliverySettingsResponseSchema } from './schema';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
const invalid = () => reply({ error: 'invalid_request' }, 400);
function failure(error: unknown) {
  try {
    if (error instanceof AuthorityError && [401, 403].includes(error.status)) return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status);
    if (error instanceof DeliverySettingsError) {
      const statuses = { invalid_request: 400, record_conflict: 409, settings_unavailable: 503 };
      if (Object.hasOwn(statuses, error.code) && statuses[error.code] === error.status) return reply({ error: error.code }, error.status);
    }
  } catch { /* Never reflect unknown driver errors. */ }
  return reply({ error: 'settings_unavailable' }, 503);
}
export async function getDeliverySettings(request: Request): Promise<Response> {
  try {
    await verifiedOrderflyIdentity();
    if (request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.username || url.password || url.searchParams.getAll('brandId').length !== 1 || url.searchParams.getAll('locationId').length > 1 || [...url.searchParams.keys()].some(key => !['brandId', 'locationId'].includes(key))) return invalid();
    const scope = settingsScopeSchema.safeParse({ brandId: url.searchParams.get('brandId'), locationId: url.searchParams.get('locationId') });
    if (!scope.success) return invalid();
    const result = deliverySettingsResponseSchema.parse(await readDeliverySettings(scope.data));
    return reply(result);
  } catch (error) { return failure(error); }
}
export async function putDeliverySettings(request: Request): Promise<Response> {
  try {
    await verifiedOrderflyIdentity();
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    const url = new URL(request.url);
    if (request.method !== 'PUT' || url.search || url.username || url.password || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return invalid();
    const reader = request.body?.getReader(); if (!reader) return invalid();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 65536) { try { await reader.cancel(); } catch { /* Reject even if cancellation fails. */ } return invalid(); }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { return invalid(); }
    const command = settingsCommandSchema.safeParse(body); if (!command.success) return invalid();
    const result = deliverySettingsResponseSchema.parse(await writeDeliverySettings(command.data));
    if (result.brandId !== command.data.brandId || result.revision !== command.data.expectedRevision + 1) throw Error('invalid_result');
    return reply(result);
  } catch (error) { return failure(error); }
}
