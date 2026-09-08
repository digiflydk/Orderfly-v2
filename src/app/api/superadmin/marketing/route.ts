import { getAdminDb } from '@/lib/firebase-admin';
import { marketingAdminAuthorized } from '@/lib/marketing/auth';
import { marketingConfig } from '@/lib/marketing/config';
import { retryMarketingJob } from '@/lib/marketing/worker';
import { getOrigin } from '@/lib/url';
const id = /^[a-zA-Z0-9_-]{1,160}$/;
export const runtime = 'nodejs';
export async function GET(request: Request) {
    if (!await marketingAdminAuthorized())
        return Response.json({ error: 'Verificeret administratorlogin er påkrævet.' }, { status: 403 });
    const brandId = new URL(request.url).searchParams.get('brandId') || '';
    if (!id.test(brandId))
        return Response.json({ error: 'Ugyldigt brand.' }, { status: 400 });
    const jobs = await getAdminDb().collection('marketingOutbox').where('brandId', '==', brandId).orderBy('createdAt', 'desc').limit(50).get();
    return Response.json({ configured: !!marketingConfig(brandId), jobs: jobs.docs.map(doc => {
            const d = doc.data();
            return { id: doc.id, state: d.state, attempts: d.attempts, updatedAt: d.updatedAt, lastError: d.lastError || null };
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
    if (!data || typeof data !== 'object' || !id.test(data.brandId || '') || !/^[a-f0-9]{64}$/.test(data.id || ''))
        return Response.json({ error: 'Invalid request' }, { status: 400 });
    return Response.json({ success: await retryMarketingJob(getAdminDb(), data.brandId, data.id) });
}
