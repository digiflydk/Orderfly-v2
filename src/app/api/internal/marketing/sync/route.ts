import { getAdminDb } from '@/lib/firebase-admin';
import { workerAuthorized } from '@/lib/marketing/auth';
import { runMarketingWorker } from '@/lib/marketing/worker';
import { runMarketingOrderWorker } from '@/lib/marketing/order-worker';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function POST(request: Request) {
    if (!workerAuthorized(request))
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const db = getAdminDb();
        const deadline = Date.now() + 100000;
        const contacts = await runMarketingWorker(db, Date.now(), undefined, deadline);
        const orders = await runMarketingOrderWorker(db, Date.now(), undefined, deadline);
        return Response.json({ contacts, orders }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch {
        return Response.json({ error: 'Worker unavailable' }, { status: 503 });
    }
}
