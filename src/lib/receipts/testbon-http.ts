import 'server-only';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { AuthorityError } from '@/lib/access/authority';
import { createSyntheticTestBonContent } from '@/lib/printing/job-content';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
const errorResponse = (error: string, status: number) => Response.json({ error }, { status, headers });

/** Read-only rendering: never touches printer jobs, credentials or pilot sessions. */
export async function getTestBonPreview(request: Request): Promise<Response> {
  try {
    await requirePlatformSuperuser();
    const url = new URL(request.url);
    const model = url.searchParams.get('model');
    const width = url.searchParams.get('paperWidthMm');
    if (request.method !== 'GET' || url.username || url.password
      || [...url.searchParams.keys()].some(key => !['model', 'paperWidthMm'].includes(key))
      || url.searchParams.getAll('model').length !== 1 || url.searchParams.getAll('paperWidthMm').length !== 1
      || !['mc-print2', 'mc-print3'].includes(model || '') || !['58', '80'].includes(width || '')
      || (model === 'mc-print2' && width !== '58')) return errorResponse('invalid_request', 400);
    const content = createSyntheticTestBonContent({ brandId: 'preview', locationId: 'preview',
      printerId: 'preview', printerRevision: 1, model, paperWidthMm: Number(width) });
    return new Response(new Uint8Array(Buffer.from(content.payloadBase64, 'base64')), {
      headers: { ...headers, 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="orderfly-testbon.png"' },
    });
  } catch (error) {
    if (error instanceof AuthorityError && [401, 403].includes(error.status)) {
      return errorResponse(error.status === 401 ? 'unauthorized' : 'forbidden', error.status);
    }
    return errorResponse('preview_unavailable', 503);
  }
}
