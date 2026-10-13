import { getAdminDb } from '@/lib/firebase-admin';
import { getOrigin } from '@/lib/url';
import { marketingAdminAuthorized } from '@/lib/marketing/auth';
import { marketingConfigurationStatus } from '@/lib/marketing/config';
import { runOmnisendContactImportWorker } from '@/lib/marketing/import-worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const brandIdPattern = /^[a-zA-Z0-9_-]{1,160}$/;
const BOOKING_SYNC_ENDPOINT = 'https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/orderfly-customer-sync-trigger';

function safeBookingEndpoint(): string | null {
  const configured = process.env.ORDERFLY_ESMERALDA_CUSTOMER_SYNC_ENDPOINT;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    return url.href === BOOKING_SYNC_ENDPOINT ? url.href : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!await marketingAdminAuthorized() || request.headers.get('origin') !== await getOrigin()) {
    return Response.json({ error: 'Verificeret administratorlogin er påkrævet.' }, { status: 403 });
  }

  const raw = await request.text();
  if (raw.length > 1024) return Response.json({ error: 'Ugyldig anmodning.' }, { status: 400 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: 'Ugyldig anmodning.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return Response.json({ error: 'Ugyldig anmodning.' }, { status: 400 });
  const data = body as Record<string, unknown>;
  if (Object.keys(data).some(key => !['brandId', 'source'].includes(key))
    || typeof data.brandId !== 'string' || !brandIdPattern.test(data.brandId)
    || (data.source !== 'omnisend' && data.source !== 'bookings')) {
    return Response.json({ error: 'Vælg et brand og en gyldig datakilde.' }, { status: 400 });
  }

  if (data.source === 'omnisend') {
    const configuration = marketingConfigurationStatus(data.brandId);
    if (!configuration.config) return Response.json({ error: 'Omnisend er ikke aktivt konfigureret for dette brand.' }, { status: 409 });
    let counts;
    try {
      counts = await runOmnisendContactImportWorker(
        getAdminDb(),
        Date.now(),
        undefined,
        Date.now() + 45_000,
        { brandId: data.brandId, allowEarly: true },
      );
    } catch {
      return Response.json({ error: 'Omnisend kunne ikke synkroniseres. Prøv igen senere.' }, { status: 503 });
    }
    const result = counts.results.find(item => item.brandId === data.brandId);
    if (!result || result.status === 'busy') {
      return Response.json({ error: 'En anden Omnisend-synkronisering kører allerede for dette brand.' }, { status: 409 });
    }
    if (result.status === 'failed') {
      return Response.json({ error: 'Omnisend kunne ikke synkroniseres. Kontrollér forbindelsen og prøv igen.' }, { status: 502 });
    }
    return Response.json({
      success: true,
      source: 'omnisend',
      imported: result.imported || 0,
      hasMore: result.hasMore === true,
      backfillComplete: result.backfillComplete === true,
      message: result.hasMore
        ? `${result.imported || 0} kontakter blev importeret. Klik igen for at hente næste side.`
        : `${result.imported || 0} kontakter blev importeret eller opdateret.`,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const endpoint = safeBookingEndpoint();
  const secret = process.env.ORDERFLY_ESMERALDA_INTEGRATION_SECRET;
  if (!endpoint || !secret || secret.length < 32) {
    return Response.json({ error: 'Bordbooking-synkroniseringen er ikke konfigureret.' }, { status: 503 });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-esmeralda-integration-secret': secret },
      body: JSON.stringify({ brandId: data.brandId }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return Response.json({ error: 'Bordbooking kunne ikke synkroniseres. Prøv igen senere.' }, { status: response.status === 404 ? 409 : 502 });
    const result: unknown = await response.json().catch(() => null);
    if (!result || typeof result !== 'object') return Response.json({ error: 'Bordbooking returnerede et ugyldigt svar.' }, { status: 502 });
    const sync = result as Record<string, unknown>;
    const enqueued = Number.isInteger(sync.enqueued) ? Number(sync.enqueued) : null;
    const processed = Number.isInteger(sync.processed) ? Number(sync.processed) : null;
    const pending = Number.isInteger(sync.pending) ? Number(sync.pending) : null;
    const succeeded = Number.isInteger(sync.succeededCount) ? Number(sync.succeededCount) : null;
    if (sync.success !== true || sync.brandId !== data.brandId
      || enqueued === null || processed === null || pending === null || succeeded === null
      || [enqueued, processed, pending, succeeded].some(value => value < 0)) {
      return Response.json({ error: 'Bordbooking returnerede et ugyldigt svar.' }, { status: 502 });
    }
    return Response.json({
      success: true,
      source: 'bookings',
      enqueued,
      processed,
      pending,
      succeededCount: succeeded,
      message: `${enqueued} manglende bookinger lagt i kø. ${succeeded} blev synkroniseret nu${pending ? `; ${pending} afventer worker-køen` : ''}.`,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Forbindelsen til bordbooking afbrød. Prøv igen senere.' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
