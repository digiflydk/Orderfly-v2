'use client';

import React, { useEffect, useRef, useState } from 'react';
import { QrManager, type QrBrandChoice, type QrCapabilities, type QrCodeSummary, type QrManagerApi } from './qr-manager';
import { QrAnalytics, type QrAnalyticsFilter } from './qr-analytics';
import { QrBulkTools, type QrBulkToolsApi } from './qr-bulk-tools';
import { QrPrintTools, type QrPrintToolsProps } from './qr-print-tools';
import { QrLifetimeSummary } from './qr-lifetime-summary';
import { QrHistory } from './qr-history';
import type { QrHistoryResult } from '@/lib/qr/history';
import type { QrScanAttribution } from '@/lib/qr/analytics';
import type { QrMetrics } from '@/lib/qr/metrics';
import type { QrLifetime } from '@/lib/qr/lifetime';

export type QrWorkspaceData = { brands: QrBrandChoice[]; codes: QrCodeSummary[]; capabilities: QrCapabilities; analytics: boolean; truncated: boolean; dynamicEnabled?: boolean; allTime?: Record<string, QrLifetime | null> };
type RenderFile = { content: string; mime: string; encoding?: 'base64' | 'utf8' | 'utf-8'; filename: string };
type AnalyticsResult = { metrics: QrMetrics; complete: boolean; currentLocationOnly: boolean; attribution?: QrScanAttribution };
const codeKey = (code: { brandId: string; id: string }) => `${code.brandId}/${code.id}`;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function isSummary(value: unknown): value is QrCodeSummary {
  if (!object(value) || !['id', 'revision', 'name', 'brandId', 'destination', 'campaign'].every(key => typeof value[key] === 'string')
    || value.kind !== 'dynamic' || value.staticType !== 'url' || !['active', 'paused', 'archived'].includes(String(value.status))
    || value.locationId !== null && typeof value.locationId !== 'string' || !Array.isArray(value.tags) || !value.tags.every(tag => typeof tag === 'string') || !object(value.fields) || !object(value.utm)) return false;
  return ['source', 'medium', 'campaign', 'content', 'term'].every(key => typeof (value.utm as Record<string, unknown>)[key] === 'string');
}
function isWorkspace(value: unknown): value is QrWorkspaceData {
  if (!object(value) || !Array.isArray(value.codes) || !value.codes.every(isSummary) || !Array.isArray(value.brands) || !object(value.capabilities)
    || typeof value.analytics !== 'boolean' || typeof value.truncated !== 'boolean') return false;
  return ['create', 'edit', 'archive', 'export'].every(key => typeof (value.capabilities as Record<string, unknown>)[key] === 'boolean')
    && value.brands.every(brand => object(brand) && typeof brand.id === 'string' && typeof brand.name === 'string' && Array.isArray(brand.locations)
      && brand.locations.every(location => object(location) && typeof location.id === 'string' && typeof location.name === 'string'));
}
function isMetrics(value: unknown): value is QrMetrics {
  const count = (number: unknown) => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0;
  const totals = (row: Record<string, unknown>) => ['totalOpenings', 'probableScans', 'excludedOpenings', 'knownUnique', 'unidentifiedScans'].every(key => count(row[key])) && (row.estimatedUnique === null || count(row.estimatedUnique));
  if (!object(value) || value.timezone !== 'Europe/Copenhagen' || !['from', 'to'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]))
    || (value.from as number) >= (value.to as number) || !totals(value)) return false;
  return ['byDay', 'byHour', 'byQr'].every(key => Array.isArray(value[key]) && (value[key] as unknown[]).every(row => object(row) && typeof row.key === 'string' && totals(row)))
    && ['byDevice', 'byOs', 'byBrowser', 'byReferrer'].every(key => Array.isArray(value[key]) && (value[key] as unknown[]).every(row => object(row) && typeof row.key === 'string' && count(row.count)));
}
function isAttribution(value: unknown): value is QrScanAttribution | undefined {
  if (value === undefined) return true;
  return object(value) && ['byCampaign', 'byLocation'].every(key => Array.isArray(value[key]) && (value[key] as unknown[]).length <= 10000 && (value[key] as unknown[]).every(row => object(row) && typeof row.key === 'string' && row.key.length <= 160 && ['openings', 'probableScans', 'excludedOpenings'].every(field => Number.isSafeInteger(row[field]) && Number(row[field]) >= 0) && row.openings === Number(row.probableScans) + Number(row.excludedOpenings)));
}
function isHistory(value: unknown): value is QrHistoryResult {
  return object(value) && typeof value.truncated === 'boolean' && Number.isSafeInteger(value.discarded) && Number(value.discarded) >= 0 && Array.isArray(value.rows) && value.rows.length <= 50 && value.rows.every(row => object(row) && ['id', 'actorId', 'action'].every(key => typeof row[key] === 'string') && Number.isSafeInteger(row.at) && Number.isFinite(new Date(Number(row.at)).getTime()) && Number.isSafeInteger(row.revision) && (row.previousRevision === null || Number.isSafeInteger(row.previousRevision)) && (row.changes === undefined || Array.isArray(row.changes) && row.changes.length <= 8 && row.changes.every(change => object(change) && typeof change.field === 'string' && [change.before, change.after].every(text => text === null || typeof text === 'string'))));
}
class QrTransportError extends Error {
  constructor(public code: string, public status?: number) { super(code); }
}

async function command<T>(value: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/qr/admin', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  } catch { throw new QrTransportError('unavailable'); }
  let result: unknown;
  try {
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('not_json');
    const text = await response.text();
    if (text.length > 6_000_000) throw new Error('too_large');
    result = JSON.parse(text);
  } catch { throw new QrTransportError('unavailable', response.status); }
  if (!response.ok) {
    const supplied = typeof result === 'object' && result !== null && 'error' in result ? String(result.error) : '';
    const known: Record<number, string[]> = { 400: ['invalid_input', 'invalid_destination'], 401: ['unauthorized'], 403: ['forbidden'], 409: ['revision_conflict', 'conflict'] };
    throw new QrTransportError(known[response.status]?.includes(supplied) ? supplied : 'unavailable', response.status);
  }
  return result as T;
}

const dateInCopenhagen = (at: number) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
function initialPeriod() {
  const to = dateInCopenhagen(Date.now());
  return { dateFrom: new Date(Date.parse(to + 'T12:00:00Z') - 6 * 86_400_000).toISOString().slice(0, 10), dateTo: to };
}

/** Transport and state only. The server rechecks every action and native scope. */
export function QrWorkspace({ initial }: { initial: QrWorkspaceData }) {
  const [data, setData] = useState(initial);
  const dataRef = useRef(data); dataRef.current = data;
  const [refreshError, setRefreshError] = useState(false);
  const [tab, setTab] = useState<'manage' | 'analytics' | 'bulk' | 'history'>('manage');
  const [filters, setFilters] = useState<QrAnalyticsFilter>(() => ({ ...initialPeriod(), qrId: '', campaign: '', placement: '' }));
  const [metrics, setMetrics] = useState<QrMetrics | null>(null);
  const [complete, setComplete] = useState(false);
  const [attribution, setAttribution] = useState<QrScanAttribution | undefined>();
  const [currentLocationOnly, setCurrentLocationOnly] = useState<boolean | undefined>();
  const [loadedQrKey, setLoadedQrKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState('');
  const latestAnalytics = useRef(0);
  const mounted = useRef(true);
  const objectUrls = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; latestAnalytics.current++;
      for (const timer of timers.current) clearTimeout(timer);
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
    };
  }, []);

  const assetUrl = (file: RenderFile) => {
    if (!mounted.current) throw new QrTransportError('unavailable');
    if (!file || !['image/png', 'image/svg+xml', 'text/csv;charset=utf-8'].includes(file.mime) || typeof file.content !== 'string' || file.content.length > 6_000_000) throw new QrTransportError('unavailable');
    let content: BlobPart = file.content;
    if (file.encoding === 'base64') {
      if (file.mime !== 'image/png' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.content)) throw new QrTransportError('unavailable');
      try { const binary = atob(file.content); content = Uint8Array.from(binary, character => character.charCodeAt(0)); }
      catch { throw new QrTransportError('unavailable'); }
    } else if (file.mime === 'image/png') throw new QrTransportError('unavailable');
    const url = URL.createObjectURL(new Blob([content], { type: file.mime })); objectUrls.current.add(url);
    const timer = setTimeout(() => { URL.revokeObjectURL(url); objectUrls.current.delete(url); timers.current.delete(timer); }, 60_000); timers.current.add(timer);
    return url;
  };
  const refreshDirectory = async () => {
    try {
      const refreshed = await command<QrWorkspaceData>({ action: 'list' });
      if (!isWorkspace(refreshed)) throw new QrTransportError('unavailable');
      if (mounted.current) { dataRef.current = refreshed; setData(refreshed); setRefreshError(false); }
      return true;
    } catch { if (mounted.current) setRefreshError(true); return false; }
  };
  const applyRecords = (records: QrCodeSummary[]) => {
    const keys = new Set(records.map(codeKey));
    const next = { ...dataRef.current, codes: [...records, ...dataRef.current.codes.filter(code => !keys.has(codeKey(code)))] };
    dataRef.current = next; setData(next);
  };
  const confirmed = async (saved: QrCodeSummary) => {
    if (!isSummary(saved)) throw new QrTransportError('unavailable');
    if (!mounted.current) return saved;
    applyRecords([saved]);
    // A failed refresh does not invalidate a confirmed write receipt.
    await refreshDirectory();
    return saved;
  };
  const api: QrManagerApi = {
    save: async (draft, context) => confirmed(await command<QrCodeSummary>({ action: 'save', draft, context })),
    setStatus: async (id, status, context) => {
      const candidates = dataRef.current.codes.filter(code => code.id === id && (!context.brandId || code.brandId === context.brandId));
      const stored = candidates.length === 1 ? candidates[0] : undefined;
      if (!stored) throw new QrTransportError('forbidden', 403);
      return confirmed(await command<QrCodeSummary>({ action: 'status', id, brandId: stored.brandId, locationId: stored.locationId, status, revision: context.revision, requestId: context.requestId }));
    },
    preview: (draft, context) => command({ action: 'render', draft, context, format: 'preview' }),
    download: async (draft, format, context) => {
      const file = await command<RenderFile>({ action: 'render', draft, context, format });
      return { url: assetUrl(file), filename: file.filename };
    },
  };
  const bulkAllowed = data.capabilities.create && data.dynamicEnabled === true;
  const bulkApi: QrBulkToolsApi = {
    preview: (brandId, csv) => command({ action: 'bulk_preview', brandId, csv }),
    commit: (brandId, input) => command({ action: 'bulk_commit', brandId, ...input }),
  };
  const afterBulk = async (records: QrCodeSummary[]) => {
    if (!records.every(isSummary)) throw new QrTransportError('unavailable');
    if (!mounted.current) return;
    applyRecords(records);
    if (!await refreshDirectory()) throw new QrTransportError('unavailable');
  };
  const renderPrint: QrPrintToolsProps['render'] = (draft, context, options) => {
    if (!dataRef.current.capabilities.export || draft.kind === 'dynamic' && dataRef.current.dynamicEnabled !== true) throw new QrTransportError('forbidden', 403);
    return command({ action: 'render', draft, context, format: options.format, ...(options.logoBase64 ? { logoBase64: options.logoBase64 } : {}) });
  };
  const codeFor = (value: QrAnalyticsFilter) => {
    const code = dataRef.current.codes.find(candidate => codeKey(candidate) === value.qrId);
    if (!code) throw new QrTransportError('select_code');
    const brand = dataRef.current.brands.find(candidate => candidate.id === code.brandId);
    const placement = brand?.locations.find(location => location.id === code.locationId)?.name || (code.locationId ? code.locationId : 'Hele brandet');
    if (value.campaign && code.campaign !== value.campaign || value.placement && placement !== value.placement) throw new QrTransportError('filter_mismatch');
    return code;
  };
  const analyticsCommand = (value: QrAnalyticsFilter, exporting = false) => {
    const code = codeFor(value);
    return { action: 'analytics', brandId: code.brandId, locationId: code.locationId, id: code.id, from: value.dateFrom, to: value.dateTo, ...(exporting ? { export: true } : {}) };
  };
  const loadAnalytics = async (value: QrAnalyticsFilter) => {
    const request = ++latestAnalytics.current; setFilters(value); setSelectionError(''); setAnalyticsError(null);
    if (!dataRef.current.analytics) return;
    let body: unknown;
    try { body = analyticsCommand(value); }
    catch (error) { setLoading(false); setAnalyticsError('selection'); setSelectionError(error instanceof QrTransportError && error.code === 'filter_mismatch' ? 'Den valgte QR-kode matcher ikke kampagne eller placering.' : 'Vælg en bestemt QR-kode for at se statistik.'); return; }
    setLoading(true);
    try {
      const result = await command<AnalyticsResult>(body);
      if (!isAttribution(result?.attribution) || !isMetrics(result?.metrics) || typeof result.complete !== 'boolean' || typeof result.currentLocationOnly !== 'boolean') throw new QrTransportError('unavailable');
      if (mounted.current && request === latestAnalytics.current) { setMetrics(result.metrics); setComplete(result.complete); setCurrentLocationOnly(result.currentLocationOnly); setAttribution(result.attribution); setLoadedQrKey(value.qrId); }
    } catch { if (mounted.current && request === latestAnalytics.current) setAnalyticsError('unavailable'); }
    finally { if (mounted.current && request === latestAnalytics.current) setLoading(false); }
  };
  const loadHistory = async (key: string) => {
    const code = dataRef.current.codes.find(candidate => codeKey(candidate) === key);
    if (!code) throw new QrTransportError('forbidden', 403);
    const result = await command<QrHistoryResult>({ action: 'history', brandId: code.brandId, locationId: code.locationId, id: code.id });
    if (!isHistory(result)) throw new QrTransportError('unavailable');
    return result;
  };
  const exportAnalytics = async () => {
    if (!data.analytics || !data.capabilities.export || !complete || !metrics || loading || analyticsError || selectionError) return;
    const result = await command<{ csv: string }>(analyticsCommand(filters, true));
    if (typeof result?.csv !== 'string') throw new QrTransportError('unavailable');
    const link = document.createElement('a'); link.href = assetUrl({ content: result.csv, mime: 'text/csv;charset=utf-8', filename: 'qr-statistik.csv' }); link.download = 'qr-statistik.csv'; document.body.append(link); link.click(); link.remove();
  };

  return <div className="space-y-6" style={{ minWidth: 0 }}>
    {<nav aria-label="QR-modul" className="flex flex-wrap gap-2"><button type="button" aria-current={tab === 'manage' ? 'page' : undefined} className="rounded-md border px-3 py-2" onClick={() => setTab('manage')}>Administration</button>{data.analytics && <button type="button" aria-current={tab === 'analytics' ? 'page' : undefined} className="rounded-md border px-3 py-2" onClick={() => setTab('analytics')}>Statistik</button>}{bulkAllowed && <button type="button" aria-current={tab === 'bulk' ? 'page' : undefined} className="rounded-md border px-3 py-2" onClick={() => setTab('bulk')}>CSV-import</button>}<button type="button" aria-current={tab === 'history' ? 'page' : undefined} className="rounded-md border px-3 py-2" onClick={() => setTab('history')}>Historik</button></nav>}
    {data.truncated && <p role="alert">Oversigten er ufuldstændig. Flere QR-koder findes end de viste. Søgning og filtre gælder kun de indlæste koder.</p>}
    {refreshError && <p role="alert">Ændringen er gemt, men oversigten kunne ikke genindlæses. Den bekræftede kode er bevaret. Genindlæs siden for en ny oversigt.</p>}
    <div hidden={tab !== 'manage'}><QrManager brands={data.brands} initialCodes={data.codes} capabilities={data.capabilities} api={api} dynamicEnabled={data.dynamicEnabled === true}
      renderExtras={(draft, context) => <QrPrintTools key={JSON.stringify([draft, context])} draft={draft} context={context} render={renderPrint} />} /></div>
    <div hidden={tab !== 'bulk' || !bulkAllowed}><QrBulkTools brands={data.brands} api={bulkApi} onCommitted={afterBulk} disabled={!bulkAllowed} /></div>
    {tab === 'history' && <QrHistory codes={data.codes.map(code => ({ id: codeKey(code), name: `${data.brands.find(brand => brand.id === code.brandId)?.name || code.brandId} · ${code.name}` }))} load={loadHistory} />}
    {tab === 'analytics' && data.analytics && <div className="space-y-3">
      <QrLifetimeSummary codes={data.codes} brands={data.brands} allTime={data.allTime} />
      <p className="text-sm text-muted-foreground">Vælg én QR-kode. Samlede tal på tværs af koder er endnu ikke tilgængelige.</p>
      {selectionError && <p role="alert">{selectionError}</p>}
      <QrAnalytics metrics={metrics ? { ...metrics, byQr: metrics.byQr.map(row => ({ ...row, key: loadedQrKey.endsWith('/' + row.key) ? loadedQrKey : row.key })) } : null} period={{ dateFrom: filters.dateFrom, dateTo: filters.dateTo }} selection={{ qrId: filters.qrId, campaign: filters.campaign, placement: filters.placement }}
        codes={data.codes.filter(code => code.kind === 'dynamic').map(code => ({ id: codeKey(code), name: code.name, campaign: code.campaign, placement: data.brands.find(brand => brand.id === code.brandId)?.locations.find(location => location.id === code.locationId)?.name || (code.locationId || 'Hele brandet') }))}
        complete={metrics ? complete : true} loading={loading} error={analyticsError} canExport={data.capabilities.export && !selectionError}
        currentLocationOnly={currentLocationOnly} attribution={attribution}
        onFilterChange={value => { void loadAnalytics(value); }} onRetry={() => { void loadAnalytics(filters); }} onExport={exportAnalytics} />
    </div>}
  </div>;
}
