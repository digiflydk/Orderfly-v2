import { getAdminDb } from '@/lib/firebase-admin';
import { workerAuthorized } from '@/lib/marketing/auth';
import { runMarketingWorker } from '@/lib/marketing/worker';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
    if (!workerAuthorized(request))
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        return Response.json(await runMarketingWorker(getAdminDb()), { headers: { 'Cache-Control': 'no-store' } });
    }
    catch {
        return Response.json({ error: 'Worker unavailable' }, { status: 503 });
    }
}
