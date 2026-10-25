import 'server-only';

export type WoltOperation = 'read' | 'quote' | 'create' | 'cancel';
export type WoltHttpError = {
  code: 'authentication' | 'configuration' | 'invalid_request' | 'unavailable' | 'rate_limited' | 'provider_error' | 'invalid_response' | 'network_error';
  nativeCode?: string;
  retryClass: 'never' | 'read_only' | 'after_reconciliation';
  outcome: 'rejected' | 'unknown';
  status?: number;
};
export type WoltHttpResult = { ok: true; data: unknown; status: number } | { ok: false; error: WoltHttpError };
export type WoltHttpRequest = { method: 'GET' | 'POST' | 'DELETE' | 'PATCH'; path: string; body?: unknown; operation: WoltOperation };
export type WoltHttpClient = { request(input: WoltHttpRequest): Promise<WoltHttpResult> };
const HOSTS = new Set(['https://daas-public-api.development.dev.woltapi.com', 'https://daas-public-api.wolt.com']);
const NATIVE_CODES = new Set(['DROPOFF_OUTSIDE_OF_DELIVERY_AREA','PICKUP_OUTSIDE_DELIVERY_AREA','INVALID_DROPOFF_ADDRESS','INVALID_PICKUP_ADDRESS','INVALID_PAYLOAD','REQUEST_OUTSIDE_DELIVERY_HOURS','INVALID_SCHEDULED_DROPOFF_TIME','CASH_ON_DELIVERY_DISABLED','DELIVERY_NOT_ENABLED_FOR_DELIVERY_AREA','DELIVERY_AREA_CLOSED','DELIVERY_AREA_CLOSED_TEMPORARILY','DUPLICATE_ORDER','VENUE_CLOSED','MISSING_MERCHANT_CONFIGURATION','B2B_CONFIG_NOT_FOUND','CORPORATE_PAYMENT_METHOD_NOT_FOUND','DELIVERY_CONFIG_MISSING_PRICING','DELIVERY_CONFIG_DELIVERY_NOT_ENABLED','VENUE_ORDER_LIMIT_EXCEEDED','ORDER_NOT_FOUND','INVALID_ORDER_STATE_TRANSITION','SHIPMENT_PROMISE_NOT_FOUND','GENERIC_INTERNAL_ERROR']);
const UNAVAILABLE = new Set(['DROPOFF_OUTSIDE_OF_DELIVERY_AREA','REQUEST_OUTSIDE_DELIVERY_HOURS','INVALID_SCHEDULED_DROPOFF_TIME','DELIVERY_NOT_ENABLED_FOR_DELIVERY_AREA','DELIVERY_AREA_CLOSED','DELIVERY_AREA_CLOSED_TEMPORARILY','VENUE_CLOSED']);
const CONFIG = new Set(['MISSING_MERCHANT_CONFIGURATION','B2B_CONFIG_NOT_FOUND','CORPORATE_PAYMENT_METHOD_NOT_FOUND','DELIVERY_CONFIG_MISSING_PRICING','DELIVERY_CONFIG_DELIVERY_NOT_ENABLED']);

/** No response reason/details or thrown network error is exposed: these may contain PII/tokens. */
export function createWoltHttpClient(context: { baseUrl: string; merchantKey: string }, options: {
  fetchImpl?: typeof fetch; timeoutMs?: number; maxReadRetries?: number; sleep?: (ms: number) => Promise<void>;
} = {}): WoltHttpClient {
  const baseUrl = context.baseUrl;
  const merchantKey = context.merchantKey;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxRetries = options.maxReadRetries ?? 0;
  if (!HOSTS.has(baseUrl) || !merchantKey || /[\r\n]/.test(merchantKey) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) throw new Error('Invalid Wolt transport configuration');
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  return { async request(input) {
    // Forbid absolute URLs, query/fragment and path traversal so credentials never leave the fixed host.
    if (!/^\/[a-zA-Z0-9_/-]+$/.test(input.path) || input.path.includes('//') || input.path.includes('..')) return { ok: false, error: { code: 'invalid_request', retryClass: 'never', outcome: 'rejected' } };
    const write = input.method !== 'GET' && !(input.operation === 'quote' && /^\/v1\/venues\/[A-Za-z0-9_-]+\/shipment-promises$/.test(input.path));
    // Only known read/quote endpoints qualify for retries. Caller labels alone cannot make a write safe.
    const safe = (input.operation === 'read' && input.method === 'GET') || (input.operation === 'quote' && input.method === 'POST' && /^\/v1\/venues\/[A-Za-z0-9_-]+\/shipment-promises$/.test(input.path));
    let body: string | undefined;
    try { body = input.body === undefined ? undefined : JSON.stringify(input.body); } catch { return { ok: false, error: { code: 'invalid_request', retryClass: 'never', outcome: 'rejected' } }; }
    if (body && Buffer.byteLength(body) > 256_000) return { ok: false, error: { code: 'invalid_request', retryClass: 'never', outcome: 'rejected' } };
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let result: WoltHttpResult;
      try {
        const response = await fetchImpl(baseUrl + input.path, { method: input.method, headers: { Authorization: `Bearer ${merchantKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body, signal: controller.signal, redirect: 'error', cache: 'no-store' });
        const reader = response.body?.getReader();
        let raw = ''; let size = 0;
        if (reader) {
          const decoder = new TextDecoder();
          while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 512_000) { await reader.cancel(); throw new Error('Body too large'); } raw += decoder.decode(chunk.value, { stream: true }); }
          raw += decoder.decode();
        }
        let data: unknown;
        try { data = raw ? JSON.parse(raw) : null; } catch { data = undefined; }
        if (response.ok && data !== undefined) result = { ok: true, data, status: response.status };
        else if (response.ok) result = { ok: false, error: { code: 'invalid_response', retryClass: write ? 'after_reconciliation' : 'never', outcome: write ? 'unknown' : 'rejected', status: response.status } };
        else {
          const candidate = data && typeof data === 'object' && 'error_code' in data ? data.error_code : undefined;
          const nativeCode = typeof candidate === 'string' && NATIVE_CODES.has(candidate) ? candidate : undefined;
          const uncertain = write && (response.status >= 500 || nativeCode === 'DUPLICATE_ORDER' || response.status === 408);
          const code: WoltHttpError['code'] = response.status === 401 || response.status === 403 ? 'authentication' : CONFIG.has(nativeCode ?? '') || response.status === 404 ? 'configuration' : response.status === 429 ? 'rate_limited' : UNAVAILABLE.has(nativeCode ?? '') ? 'unavailable' : response.status >= 500 ? 'provider_error' : 'invalid_request';
          result = { ok: false, error: { code, ...(nativeCode ? { nativeCode } : {}), status: response.status, outcome: uncertain ? 'unknown' : 'rejected', retryClass: uncertain ? 'after_reconciliation' : safe && (response.status >= 500 || response.status === 429) ? 'read_only' : 'never' } };
        }
      } catch {
        result = { ok: false, error: { code: 'network_error', retryClass: write ? 'after_reconciliation' : safe ? 'read_only' : 'never', outcome: write ? 'unknown' : 'rejected' } };
      } finally { clearTimeout(timer); }
      if (result.ok || !safe || result.error.retryClass !== 'read_only' || attempt >= maxRetries) return result;
      await sleep(result.error.status === 429 ? 5_000 : Math.min(1_000 * 2 ** attempt, 5_000));
    }
  } };
}
