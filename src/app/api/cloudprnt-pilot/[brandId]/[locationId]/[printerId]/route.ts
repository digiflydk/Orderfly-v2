import { handleSyntheticPilotHttp } from '@/lib/printing/synthetic-pilot-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ brandId: string; locationId: string; printerId: string }> };
const handle = (request: Request, context: Context) => handleSyntheticPilotHttp(request, context?.params);
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
// Next otherwise routes HEAD through GET, which could consume a one-shot download.
export const HEAD = handle;
