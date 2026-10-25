import 'server-only';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { readPrintLog } from './print-log-read';
import { PrintLogError } from './print-log';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
export async function handlePrintLog(request: Request) {
  try {
    await requirePlatformSuperuser();
    if (request.method !== 'GET') return reply({ error: 'method_not_allowed' }, 405);
    const params = new URL(request.url).searchParams, keys = [...params.keys()];
    if (new Set(keys).size !== keys.length || keys.some(key => !['brandId', 'cursor', 'limit'].includes(key))
      || !params.get('brandId') || (params.has('limit') && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(params.get('limit')!))
      || (params.has('cursor') && !params.get('cursor'))) return reply({ error: 'print_log_invalid' }, 400);
    return reply(await readPrintLog({ brandId: params.get('brandId')!, cursor: params.get('cursor') ?? undefined, limit: params.has('limit') ? Number(params.get('limit')) : undefined }));
  } catch (error) {
    if (error instanceof AuthorityError) return reply({ error: error.status === 401 ? 'unauthorized' : error.status === 403 ? 'forbidden' : 'print_log_unavailable' }, error.status === 401 ? 401 : error.status === 403 ? 403 : 503);
    if (error instanceof PrintLogError) return reply({ error: error.code }, error.status);
    return reply({ error: 'print_log_unavailable' }, 503);
  }
}
