import { getAdminDb } from '@/lib/firebase-admin';
import { marketingAdminAuthorized } from '@/lib/marketing/auth';
import { marketingConfig } from '@/lib/marketing/config';
import { retryMarketingJob } from '@/lib/marketing/worker';
import { retryMarketingOrderJob } from '@/lib/marketing/order-worker';
import { getOrigin } from '@/lib/url';
const id = /^[a-zA-Z0-9_-]{1,160}$/;
export const runtime = 'nodejs';
export async function GET(request: Request) {
    if (!await marketingAdminAuthorized())
        return Response.json({ error: 'Verificeret administratorlogin er påkrævet.' }, { status: 403 });
    const brandId = new URL(request.url).searchParams.get('brandId') || '';
    if (!id.test(brandId))
        return Response.json({ error: 'Ugyldigt brand.' }, { status: 400 });
    const db = getAdminDb();
    const [contacts, orders] = await Promise.all([
        db.collection('marketingOutbox').where('brandId', '==', brandId).orderBy('createdAt', 'desc').limit(50).get(),
        db.collection('marketingOrderOutbox').where('brandId', '==', brandId).orderBy('createdAt', 'desc').limit(50).get(),
    ]);
    const jobs = [
        ...contacts.docs.map(doc => ({ doc, kind: 'contact' as const })),
        ...orders.docs.map(doc => ({ doc, kind: 'paid_order' as const })),
    ].sort((a, b) => Number(b.doc.data().createdAt || 0) - Number(a.doc.data().createdAt || 0)).slice(0, 50);
    return Response.json({ configured: !!marketingConfig(brandId), jobs: jobs.map(({ doc, kind }) => {
            const d = doc.data();
            return { id: doc.id, kind, state: d.state, attempts: d.attempts, updatedAt: d.updatedAt, lastError: d.lastError || null };
        }) }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
    if (!await marketingAdminAuthorized() || request.headers.get('origin') !== await getOrigin())
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    const body = await request.text();
    if (body.length > 1024)
        return Response.json({ error: 'Invalid request' }, { status: 400 });
    let data;
    try {
        data = JSON.parse(body);
    }
    catch {
        return Response.json({ error: 'Invalid request' }, { status: 400 });
    }
    if (!data || typeof data !== 'object' || !id.test(data.brandId || '') || !/^[a-f0-9]{64}$/.test(data.id || '') || !['contact', 'paid_order'].includes(data.kind))
        return Response.json({ error: 'Invalid request' }, { status: 400 });
    const success = data.kind === 'paid_order'
        ? await retryMarketingOrderJob(getAdminDb(), data.brandId, data.id)
        : await retryMarketingJob(getAdminDb(), data.brandId, data.id);
    return Response.json({ success });
}
