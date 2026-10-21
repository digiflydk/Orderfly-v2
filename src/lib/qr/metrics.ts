/** Pure QR measurement rules. An HTTP opening is not proof of a camera scan. */
export type QrRequestInput = {
  method: string; userAgent?: string | null; purpose?: string | null;
  secPurpose?: string | null; referrer?: string | null;
};
export type QrRequestClassification = {
  opening: boolean; probableScan: boolean;
  exclusion: 'none' | 'head' | 'method' | 'prefetch' | 'bot' | 'unknown-agent';
  device: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  os: 'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux' | 'unknown';
  browser: 'Edge' | 'Opera' | 'Samsung Internet' | 'Chrome' | 'Firefox' | 'Safari' | 'unknown';
  referrerOrigin: string | null;
};

/** Never retain referrer paths, query parameters, fragments, credentials or opaque origins. */
export function qrReferrerOrigin(value?: string | null): string | null {
  if (!value || value.length > 4096) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch { return null; }
}

export function classifyQrRequest(input: QrRequestInput): QrRequestClassification {
  const method = input.method.toUpperCase();
  // Bound work and do not return or retain the raw user agent.
  const ua = (input.userAgent ?? '').slice(0, 2048);
  const purpose = `${(input.purpose ?? '').slice(0, 256)} ${(input.secPurpose ?? '').slice(0, 256)}`;
  const prefetch = /\b(?:prefetch|prerender|preview)\b/i.test(purpose);
  const bot = /bot|crawler|spider|slurp|facebookexternalhit|facebot|whatsapp|telegrambot|slackbot|discordbot|twitterbot|linkedinbot|headlesschrome|lighthouse|pagespeed|googleweblight|bingpreview|curl\/|wget\/|python-requests|go-http-client|uptime|monitoring/i.test(ua);
  const tablet = /ipad|tablet|kindle|silk\/|playbook/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua));
  const device = tablet ? 'tablet' : /iphone|ipod|mobile/i.test(ua) ? 'mobile'
    : /windows|macintosh|x11|linux/i.test(ua) ? 'desktop' : 'unknown';
  const os = /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android'
    : /windows/i.test(ua) ? 'Windows' : /macintosh|mac os x/i.test(ua) ? 'macOS'
    : /linux/i.test(ua) ? 'Linux' : 'unknown';
  const browser = /edg(?:e|a|ios)?\//i.test(ua) ? 'Edge' : /opr\/|opera/i.test(ua) ? 'Opera'
    : /samsungbrowser\//i.test(ua) ? 'Samsung Internet' : /chrome\/|crios\//i.test(ua) ? 'Chrome'
    : /firefox\/|fxios\//i.test(ua) ? 'Firefox' : /safari\//i.test(ua) ? 'Safari' : 'unknown';
  const exclusion = method === 'HEAD' ? 'head' : method !== 'GET' ? 'method'
    : prefetch ? 'prefetch' : bot ? 'bot' : !ua.trim() ? 'unknown-agent' : 'none';
  return { opening: method === 'GET', probableScan: exclusion === 'none', exclusion,
    device, os, browser, referrerOrigin: qrReferrerOrigin(input.referrer) };
}

export type QrMetricEvent = {
  timestamp: number; qrId: string; classification: QrRequestClassification;
  /** Optional identifier from the caller's separately reviewed identity policy. Never raw IP/UA. */
  visitorKey?: string | null;
};
export type QrMetricTotals = {
  totalOpenings: number; probableScans: number; excludedOpenings: number;
  knownUnique: number; unidentifiedScans: number; estimatedUnique: number | null;
};
export type QrMetricBucket = QrMetricTotals & { key: string };
export type QrMetrics = QrMetricTotals & {
  from: number; to: number; timezone: 'Europe/Copenhagen';
  byDay: QrMetricBucket[]; byHour: QrMetricBucket[];
  byQr: QrMetricBucket[];
  byDevice: Array<{ key: string; count: number }>;
  byOs: Array<{ key: string; count: number }>;
  byBrowser: Array<{ key: string; count: number }>;
  byReferrer: Array<{ key: string; count: number }>;
};

const localFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
});

/** Offset in hour keys keeps the two autumn 02:00 hours distinct. */
export function qrLocalBuckets(timestamp: number): { day: string; hour: string } {
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) throw new RangeError('Invalid timestamp');
  const parts = Object.fromEntries(localFormatter.formatToParts(timestamp).map(p => [p.type, p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00';
  return { day, hour: `${day}T${parts.hour}:00${offset}` };
}

type Accumulator = { openings: number; scans: number; unidentified: number; keys: Set<string> };
const newAccumulator = (): Accumulator => ({ openings: 0, scans: 0, unidentified: 0, keys: new Set() });
function add(acc: Accumulator, event: QrMetricEvent): void {
  if (event.classification.opening) acc.openings++;
  if (!event.classification.probableScan) return;
  acc.scans++;
  if (event.visitorKey) acc.keys.add(event.visitorKey); else acc.unidentified++;
}
function totals(acc: Accumulator): QrMetricTotals {
  return { totalOpenings: acc.openings, probableScans: acc.scans, excludedOpenings: acc.openings - acc.scans,
    knownUnique: acc.keys.size, unidentifiedScans: acc.unidentified,
    estimatedUnique: acc.unidentified ? null : acc.keys.size };
}
function validateEvent(event: QrMetricEvent): void {
  if (!Number.isFinite(event.timestamp) || !Number.isFinite(new Date(event.timestamp).getTime())) throw new RangeError('Invalid event timestamp');
  if (!event.qrId || event.qrId.length > 256) throw new RangeError('Invalid QR ID');
  if (event.visitorKey != null && (!event.visitorKey || event.visitorKey.length > 256 || /[\s\u0000-\u001f]/u.test(event.visitorKey))) throw new RangeError('Invalid visitor key');
  if (typeof event.classification.opening !== 'boolean' || typeof event.classification.probableScan !== 'boolean'
    || (event.classification.probableScan && !event.classification.opening)) throw new TypeError('Invalid classification');
}

/** Count one event per completed server recording. The caller owns retry/idempotency and completeness. */
export function aggregateQrMetrics(events: readonly QrMetricEvent[], range: { from: number; to: number; qrId?: string }): QrMetrics {
  if (!Number.isFinite(range.from) || !Number.isFinite(range.to) || range.from >= range.to
    || !Number.isFinite(new Date(range.from).getTime()) || !Number.isFinite(new Date(range.to).getTime())) throw new RangeError('Invalid interval');
  const overall = newAccumulator();
  const maps = { byDay: new Map<string, Accumulator>(), byHour: new Map<string, Accumulator>(), byQr: new Map<string, Accumulator>() };
  const counts = { byDevice: new Map<string, number>(), byOs: new Map<string, number>(), byBrowser: new Map<string, number>(), byReferrer: new Map<string, number>() };
  for (const event of events) {
    validateEvent(event);
    if (event.timestamp < range.from || event.timestamp >= range.to || (range.qrId !== undefined && event.qrId !== range.qrId)) continue;
    const local = qrLocalBuckets(event.timestamp);
    add(overall, event);
    for (const [map, key] of [[maps.byDay, local.day], [maps.byHour, local.hour], [maps.byQr, event.qrId]] as const) {
      let acc = map.get(key);
      if (!acc) { acc = newAccumulator(); map.set(key, acc); }
      add(acc, event);
    }
    if (event.classification.probableScan) {
      for (const [map, key] of [[counts.byDevice, event.classification.device], [counts.byOs, event.classification.os],
        [counts.byBrowser, event.classification.browser], [counts.byReferrer, qrReferrerOrigin(event.classification.referrerOrigin) ?? 'unknown']] as const)
        map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  const buckets = (map: Map<string, Accumulator>, chronological = false): QrMetricBucket[] => [...map]
    .sort(([a], [b]) => chronological ? Date.parse(a) - Date.parse(b) : a.localeCompare(b))
    .map(([key, acc]) => ({ key, ...totals(acc) }));
  const breakdown = (map: Map<string, number>) => [...map].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count }));
  return { ...totals(overall), from: range.from, to: range.to, timezone: 'Europe/Copenhagen',
    byDay: buckets(maps.byDay), byHour: buckets(maps.byHour, true), byQr: buckets(maps.byQr),
    byDevice: breakdown(counts.byDevice), byOs: breakdown(counts.byOs), byBrowser: breakdown(counts.byBrowser), byReferrer: breakdown(counts.byReferrer) };
}

export type QrCsvCell = string | number | boolean | null | undefined;
/** Quote every cell and neutralize formula-leading strings, including leading invisible whitespace. */
export function serializeQrCsv(rows: readonly (readonly QrCsvCell[])[]): string {
  return rows.map(row => row.map(cell => {
    if (typeof cell === 'number' && !Number.isFinite(cell)) throw new TypeError('Invalid CSV number');
    let text = cell == null ? '' : String(cell);
    if (typeof cell === 'string' && /^[\s\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]*[=+\-@]/u.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n') + (rows.length ? '\r\n' : '');
}
