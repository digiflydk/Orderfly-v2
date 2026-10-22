import 'server-only';
import { AuthorityError } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getOrigin } from '@/lib/url';
import { ReceiptSettingsError, readReceiptSettings, writeReceiptSettings, receiptBrandIdSchema,
  receiptSettingsCommandSchema, receiptSettingsRecordSchema } from './settings-server';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
const invalid = () => reply({ error: 'invalid_request' }, 400);
function failure(error: unknown) {
  try {
    if (error instanceof AuthorityError && [401, 403].includes(error.status)) return reply({ error: error.status === 401 ? 'unauthorized' : 'forbidden' }, error.status);
    if (error instanceof ReceiptSettingsError) {
      const statuses = { invalid_request: 400, record_conflict: 409, settings_unavailable: 503 };
      if (Object.hasOwn(statuses, error.code) && statuses[error.code] === error.status) return reply({ error: error.code }, error.status);
    }
  } catch { /* Never reflect unknown driver errors. */ }
  return reply({ error: 'settings_unavailable' }, 503);
}
export async function getReceiptSettings(request: Request): Promise<Response> {
  try {
    await requirePlatformSuperuser();
    if (request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    const url = new URL(request.url), ids = url.searchParams.getAll('brandId');
    if (request.method !== 'GET' || url.username || url.password || ids.length !== 1 || [...url.searchParams.keys()].some(key => key !== 'brandId')) return invalid();
    const brandId = receiptBrandIdSchema.safeParse(ids[0]); if (!brandId.success) return invalid();
    const result = receiptSettingsRecordSchema.parse(await readReceiptSettings(brandId.data));
    if (result.brandId !== brandId.data) throw Error('invalid_result');
    return reply(result);
  } catch (error) { return failure(error); }
}
export async function putReceiptSettings(request: Request): Promise<Response> {
  try {
    await requirePlatformSuperuser();
    if (request.headers.get('origin') !== await getOrigin() || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'forbidden' }, 403);
    const url = new URL(request.url);
    if (request.method !== 'PUT' || url.search || url.username || url.password || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || '')) return invalid();
    const reader = request.body?.getReader(); if (!reader) return invalid();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { try { await reader.cancel(); } catch { /* Reject even if cancellation fails. */ } return invalid(); }
      chunks.push(value);
    }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { return invalid(); }
    const command = receiptSettingsCommandSchema.safeParse(body); if (!command.success) return invalid();
    const result = receiptSettingsRecordSchema.parse(await writeReceiptSettings(command.data));
    if (result.brandId !== command.data.brandId || result.revision !== command.data.expectedRevision + 1) throw Error('invalid_result');
    return reply(result);
  } catch (error) { return failure(error); }
}
