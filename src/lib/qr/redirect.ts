import { randomUUID } from 'node:crypto';
import { classifyQrRequest, type QrMetricEvent } from './metrics';
import { normalizeDestination, QrPayloadError } from './payload';
import { createQrStore, QR_PATHS, QrStoreError, type QrDatabase } from './store';

export const QR_RATE_LIMIT_COLLECTION = 'qrRateLimits';
export const QR_GETS_PER_CODE_MINUTE = 500;
export const QR_EVENT_RETENTION_DAYS = 90;
const DAY = 86_400_000;
export type QrStoredMetricEvent = QrMetricEvent & {
  brandId: string; locationId: string | null; campaign: string; tags: string[]; expiresAt: Date;
};
export type QrRedirectDependencies = {
  db: () => QrDatabase; enabled: boolean; environment?: string; now?: () => number; eventId?: () => string;
};
class RateLimitError extends Error { constructor(public retryAfter: number) { super('rate_limit'); } }
const responseHeaders = {
  'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff',
};
function errorResponse(status: number, extra?: Record<string, string>) {
  return new Response(status === 429 ? 'For mange åbninger. Prøv igen om lidt.' : status === 503 ? 'QR-linket er midlertidigt utilgængeligt.' : 'QR-koden er ikke tilgængelig.',
    { status, headers: { ...responseHeaders, 'Content-Type': 'text/plain; charset=utf-8', ...extra } });
}

/** Request URL and direct Host must agree. Forwarded host/geo/IP are never authority here. */
export function isQrCanonicalRequest(request: Request, environment?: string): boolean {
  const url = new URL(request.url), directHost = request.headers.get('host')?.toLowerCase();
  if (directHost && directHost !== url.host.toLowerCase()) return false;
  if (url.protocol === 'https:' && url.host.toLowerCase() === 'orderfly.dk') return true;
  return environment === 'development' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
}

/** Public endpoint. Every counted opening and its rate-limit increment commit atomically. */
async function executeQrRedirect(request: Request, slug: string, dependencies: QrRedirectDependencies): Promise<Response> {
  if (!dependencies.enabled || !isQrCanonicalRequest(request, dependencies.environment)) return errorResponse(404);
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return errorResponse(405, { Allow: 'GET, HEAD' });
  if (!/^[a-f0-9]{32}$/.test(slug)) return errorResponse(404);
  const clock = dependencies.now ?? Date.now;
  const classification = classifyQrRequest({ method, userAgent: request.headers.get('user-agent'),
    purpose: request.headers.get('purpose'), secPurpose: request.headers.get('sec-purpose'), referrer: request.headers.get('referer') });
  // IDs are generated once outside the retryable transaction. No client ID, IP or cookie is retained.
  const eventId = method === 'GET' ? (dependencies.eventId ?? randomUUID)() : null;
  try {
    if (eventId !== null && !/^[a-f0-9-]{36}$/i.test(eventId)) throw new Error('invalid_event_id_source');
    const db = dependencies.db(), store = createQrStore(db, { normalizeDestination, now: clock });
    const destination = await db.runTransaction(async tx => {
      const target = await store.resolveInTransaction(tx, slug);
      if (method === 'HEAD') return target.destination;
      const at = clock();
      const codeRef = db.collection('brands').doc(target.brandId).collection(QR_PATHS.codes).doc(target.codeId);
      const minute = Math.floor(at / 60_000);
      const limitRef = codeRef.collection(QR_RATE_LIMIT_COLLECTION).doc(String(minute));
      const limit = await tx.get(limitRef);
      const count = limit.exists ? limit.data()?.count : 0;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('invalid_rate_state');
      if (count >= QR_GETS_PER_CODE_MINUTE) throw new RateLimitError(Math.max(1, Math.ceil(((minute + 1) * 60_000 - at) / 1000)));
      const event: QrStoredMetricEvent = { timestamp: at, qrId: target.codeId, classification,
        brandId: target.brandId, locationId: target.locationId, campaign: target.campaign, tags: target.tags,
        expiresAt: new Date(at + QR_EVENT_RETENTION_DAYS * DAY) };
      tx.set(limitRef, { brandId: target.brandId, qrId: target.codeId, count: count + 1, expiresAt: new Date((minute + 1) * 60_000 + DAY) });
      tx.create(codeRef.collection(QR_PATHS.events).doc(eventId!), event);
      return target.destination;
    });
    return new Response(null, { status: 302, headers: { ...responseHeaders, Location: destination } });
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse(429, { 'Retry-After': String(error.retryAfter) });
    if (error instanceof QrStoreError && [400, 403, 404].includes(error.status) || error instanceof QrPayloadError) return errorResponse(404);
    return errorResponse(503, { 'Retry-After': '60' });
  }
}

export async function handleQrRedirect(request: Request, slug: string, dependencies: QrRedirectDependencies): Promise<Response> {
  const response = await executeQrRedirect(request, slug, dependencies);
  return request.method.toUpperCase() === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
}
