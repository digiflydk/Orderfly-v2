import { aggregateQrMetrics, qrReferrerOrigin, serializeQrCsv, type QrCsvCell, type QrMetricEvent, type QrMetrics, type QrRequestClassification } from './metrics';
import { QR_PATHS, type QrScope } from './store';

// Scope must originate from a current native :analytics/:export authorization.
export type QrAnalyticsScope = QrScope;
export type QrAnalyticsCode = { id: string; brandId: string; locationId: string | null; name: string; campaign: string; tags: string[] };
type Snapshot = { id: string; data(): Record<string, unknown> | undefined };
type Query = { where(field: string, op: string, value: unknown): Query; orderBy(field: string, direction?: 'asc' | 'desc'): Query; limit(value: number): Query; get(): Promise<{ docs: Snapshot[] }> };
type Collection = Query & { doc(id: string): Reference };
type Reference = { collection(name: string): Collection };
export type QrAnalyticsDatabase = { collection(name: string): Collection };
export type QrAnalyticsResult = {
  code: QrAnalyticsCode; metrics: QrMetrics; complete: boolean; totalsAreExact: boolean;
  truncated: boolean; retentionLimited: boolean; futureLimited: boolean; discardedEvents: number; sampledEvents: number;
  currentLocationOnly: boolean; dataAsOf: number; retainedFrom: number; period: { from: number; to: number; timezone: 'Europe/Copenhagen' };
};
export class QrAnalyticsError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
const fail = (code: string, status = 400): never => { throw new QrAnalyticsError(code, status); };
const DAY = 86_400_000;
export const QR_ANALYTICS_EVENT_LIMIT = 10_000;
export const QR_ANALYTICS_RETENTION_DAYS = 90;
const validKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

function validDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail('invalid_date');
  const at = Date.parse(value + 'T00:00:00Z');
  const year = Number(value.slice(0, 4));
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== value || year < 2000 || year > 9998) return fail('invalid_date');
  return value;
}
function localMidnight(day: string): number {
  const utc = Date.parse(day + 'T00:00:00Z');
  let result = utc;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(calendar.formatToParts(result).map(v => [v.type, v.value]));
    const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    result -= represented - utc;
  }
  return result;
}
/** Inclusive Danish calendar dates. Invalid dates never roll into another month. */
export function parseQrAnalyticsDates(input: { from: string; to: string }): { from: number; to: number } {
  const from = validDate(input.from), to = validDate(input.to);
  const first = Date.parse(from + 'T00:00:00Z'), last = Date.parse(to + 'T00:00:00Z');
  if (last < first || (last - first) / DAY >= 366) return fail('invalid_interval');
  const next = new Date(last + DAY).toISOString().slice(0, 10);
  return { from: localMidnight(from), to: localMidnight(next) };
}

function interval(range: { from: number; to: number }) {
  if (!Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 0 || range.from >= range.to
    || range.to - range.from > 366 * DAY + 3_600_000 || !Number.isFinite(new Date(range.to).getTime())) return fail('invalid_interval');
}
function scopeCheck(scope: QrAnalyticsScope, id: string) {
  if (!validKey(scope?.brandId) || !validKey(scope?.actorId) || !validKey(id)) return fail('invalid_scope');
  if (scope.locationIds !== null && (!Array.isArray(scope.locationIds) || !scope.locationIds.length || scope.locationIds.length > 500
    || scope.locationIds.some(v => !validKey(v)))) return fail('forbidden', 403);
}
const exclusions = new Set(['none', 'head', 'method', 'prefetch', 'bot', 'unknown-agent']);
const devices = new Set(['mobile', 'tablet', 'desktop', 'unknown']);
const operatingSystems = new Set(['iOS', 'Android', 'Windows', 'macOS', 'Linux', 'unknown']);
const browsers = new Set(['Edge', 'Opera', 'Samsung Internet', 'Chrome', 'Firefox', 'Safari', 'unknown']);
function classification(value: unknown): QrRequestClassification | null {
  if (!value || typeof value !== 'object') return null;
  const c = value as QrRequestClassification;
  if (typeof c.opening !== 'boolean' || typeof c.probableScan !== 'boolean' || (c.probableScan && (!c.opening || c.exclusion !== 'none'))
    || !exclusions.has(c.exclusion) || !devices.has(c.device) || !operatingSystems.has(c.os) || !browsers.has(c.browser)
    || (c.referrerOrigin !== null && typeof c.referrerOrigin !== 'string')) return null;
  return { opening: c.opening, probableScan: c.probableScan, exclusion: c.exclusion, device: c.device, os: c.os, browser: c.browser,
    referrerOrigin: qrReferrerOrigin(c.referrerOrigin) };
}
function expiryMillis(value: unknown): number | null {
  try {
    const millis = value instanceof Date ? value.getTime() : value && typeof value === 'object' && 'toMillis' in value
      && typeof value.toMillis === 'function' ? value.toMillis() : null;
    return typeof millis === 'number' && Number.isSafeInteger(millis) ? millis : null;
  } catch { return null; }
}

export function createQrAnalyticsService(db: QrAnalyticsDatabase, options: {
  getCode: (scope: QrAnalyticsScope, id: string) => Promise<QrAnalyticsCode>; now?: () => number;
}) {
  const now = options.now ?? Date.now;
  return {
    async read(scope: QrAnalyticsScope, id: string, range: { from: number; to: number }): Promise<QrAnalyticsResult> {
      scopeCheck(scope, id); interval(range);
      const dataAsOf = now();
      if (!Number.isSafeInteger(dataAsOf) || dataAsOf < 0 || !Number.isFinite(new Date(dataAsOf).getTime())) return fail('invalid_clock', 503);
      const retainedFrom = Math.max(0, dataAsOf - QR_ANALYTICS_RETENTION_DAYS * DAY);
      const queryFrom = Math.max(range.from, retainedFrom);
      // Mandatory stored-record lookup before constructing any events query.
      const found = await options.getCode(scope, id);
      if (!found || found.id !== id || found.brandId !== scope.brandId || (found.locationId !== null && !validKey(found.locationId))) return fail('not_found', 404);
      if (scope.locationIds !== null && (found.locationId === null || !scope.locationIds.includes(found.locationId))) return fail('forbidden', 403);
      const code: QrAnalyticsCode = { id: found.id, brandId: found.brandId, locationId: found.locationId, name: found.name, campaign: found.campaign, tags: [...found.tags] };
      // Brand-wide callers retain the whole code history. Delegated readers see
      // only its current location, never a former location's event history.
      const currentLocationOnly = scope.locationIds !== null;
      let query = db.collection('brands').doc(scope.brandId).collection(QR_PATHS.codes).doc(id).collection(QR_PATHS.events)
        .where('brandId', '==', scope.brandId).where('qrId', '==', id);
      if (currentLocationOnly) query = query.where('locationId', '==', code.locationId);
      const result = queryFrom >= range.to ? { docs: [] } : await query
        .where('timestamp', '>=', queryFrom).where('timestamp', '<', range.to)
        .orderBy('timestamp', 'asc').orderBy('__name__', 'asc').limit(QR_ANALYTICS_EVENT_LIMIT + 1).get();
      const truncated = result.docs.length > QR_ANALYTICS_EVENT_LIMIT, events: QrMetricEvent[] = [];
      let discardedEvents = 0;
      for (const snapshot of result.docs.slice(0, QR_ANALYTICS_EVENT_LIMIT)) {
        const row = snapshot.data(), c = classification(row?.classification), expiresAt = expiryMillis(row?.expiresAt);
        if (!row || row.brandId !== scope.brandId || row.qrId !== id || (row.locationId !== null && !validKey(row.locationId))
          || (currentLocationOnly && row.locationId !== code.locationId) || !Number.isSafeInteger(row.timestamp)
          || (row.timestamp as number) < queryFrom || (row.timestamp as number) >= range.to || !c || expiresAt === null || expiresAt <= dataAsOf) { discardedEvents++; continue; }
        // Identifiers are deliberately not projected. This release cannot estimate unique visitors.
        events.push({ timestamp: row.timestamp as number, qrId: id, classification: c });
      }
      const retentionLimited = range.from < retainedFrom, futureLimited = range.to > dataAsOf;
      const complete = !truncated && !retentionLimited && !futureLimited && discardedEvents === 0;
      return { code, metrics: aggregateQrMetrics(events, { ...range, qrId: id }), complete, totalsAreExact: complete,
        truncated, retentionLimited, futureLimited, discardedEvents, sampledEvents: events.length, currentLocationOnly, dataAsOf, retainedFrom,
        period: { ...range, timezone: 'Europe/Copenhagen' } };
    },
  };
}

/** Aggregate export only. The caller must separately enforce the export action. */
export function exportQrAnalyticsCsv(result: QrAnalyticsResult): string {
  const m = result.metrics;
  const rows: QrCsvCell[][] = [
    ['dimension', 'key', 'openings', 'probable_scans', 'excluded_openings', 'estimated_unique', 'count', 'complete', 'from', 'to', 'timezone', 'current_location_only'],
  ];
  const suffix: QrCsvCell[] = [result.complete, result.period.from, result.period.to, result.period.timezone, result.currentLocationOnly];
  rows.push(['total', result.code.name, m.totalOpenings, m.probableScans, m.excludedOpenings, m.estimatedUnique, null, ...suffix]);
  for (const [dimension, buckets] of [['day', m.byDay], ['hour', m.byHour], ['qr', m.byQr]] as const)
    for (const bucket of buckets) rows.push([dimension, bucket.key, bucket.totalOpenings, bucket.probableScans, bucket.excludedOpenings, bucket.estimatedUnique, null, ...suffix]);
  for (const [dimension, buckets] of [['device', m.byDevice], ['os', m.byOs], ['browser', m.byBrowser], ['referrer', m.byReferrer]] as const)
    for (const bucket of buckets) rows.push([dimension, bucket.key, null, null, null, null, bucket.count, ...suffix]);
  return serializeQrCsv(rows);
}
