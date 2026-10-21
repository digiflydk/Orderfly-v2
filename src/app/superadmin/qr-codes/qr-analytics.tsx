'use client';

import { useEffect, useId, useState } from 'react';
import type { QrMetrics, QrMetricBucket } from '@/lib/qr/metrics';

export type QrAnalyticsFilter = { dateFrom: string; dateTo: string; qrId: string; campaign: string; placement: string };
export type QrAnalyticsCode = { id: string; name: string; campaign?: string; placement?: string };
export type QrAnalyticsProps = {
  metrics: QrMetrics | null;
  period: { dateFrom: string; dateTo: string };
  codes?: QrAnalyticsCode[];
  selection?: { qrId?: string; campaign?: string; placement?: string };
  loading?: boolean;
  error?: string | null;
  complete: boolean;
  /** Server report scope, never inferred from the current catalog or client permissions. */
  currentLocationOnly?: boolean;
  canExport: boolean;
  onFilterChange?: (filters: QrAnalyticsFilter) => void;
  onExport?: () => void | Promise<void>;
  onRetry?: () => void;
};

const number = (value: number) => new Intl.NumberFormat('da-DK').format(value);
const dateTime = (value: number) => new Intl.DateTimeFormat('da-DK', {
  timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short',
}).format(value);
const box = 'rounded-lg border bg-card p-4 space-y-3';
const input = 'rounded-md border bg-background px-3 py-2 text-sm';
const action = 'rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50';
const labels: Record<string, string> = { mobile: 'Mobil', tablet: 'Tablet', desktop: 'Computer', unknown: 'Ukendt' };

function CountsTable({ title, values }: { title: string; values: Array<{ key: string; count: number }> }) {
  return <section className={box} style={{ minWidth: 0 }}>
    <h3 className="font-medium">{title}</h3>
    <div style={{ overflowX: 'auto' }}><table className="w-full text-sm" aria-label={title}>
      <thead><tr><th scope="col" className="text-left">Kategori</th><th scope="col" className="text-right">Sandsynlige scanninger</th></tr></thead>
      <tbody>{values.map(row => <tr key={row.key}><th scope="row" className="py-2 text-left font-normal" style={{ overflowWrap: 'anywhere' }}>{labels[row.key] ?? row.key}</th><td className="text-right">{number(row.count)}</td></tr>)}</tbody>
    </table></div>
    {!values.length && <p className="text-sm text-muted-foreground">Ingen hændelser i perioden.</p>}
  </section>;
}

function Timeline({ values, hourly, complete }: { values: QrMetricBucket[]; hourly: boolean; complete: boolean }) {
  const title = hourly ? 'Scanninger pr. time' : 'Scanninger pr. dag';
  const shown = values.slice(-60);
  const max = Math.max(1, ...shown.map(row => row.probableScans));
  const width = 600, height = 140;
  return <section className={box} style={{ minWidth: 0 }}>
    <h3 className="font-medium">{title}</h3>
    {shown.length > 0 && <>
      <svg role="img" aria-label={`${title}. Detaljer findes i tabellen nedenfor.`} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 140 }}>
        <title>{title}</title>
        {shown.map((row, index) => {
          const column = width / shown.length, bar = row.probableScans / max * 120;
          return <rect key={row.key} x={index * column + 1} y={height - bar} width={Math.max(1, column - 2)} height={bar} fill="currentColor" className="text-primary"><title>{row.key}: {number(row.probableScans)}</title></rect>;
        })}
      </svg>
      {values.length > shown.length && <p className="text-sm text-muted-foreground">Grafen viser de seneste 60 intervaller. Tabellen indeholder alle indlæste intervaller.</p>}
    </>}
    <div style={{ overflowX: 'auto' }}><table className="w-full text-sm" aria-label={title}>
      <thead><tr><th scope="col" className="text-left">{hourly ? 'Dansk time og UTC-offset' : 'Dansk dato'}</th><th scope="col" className="text-right">Åbninger</th><th scope="col" className="text-right">Sandsynlige scanninger</th><th scope="col" className="text-right">Estimerede unikke</th></tr></thead>
      <tbody>{values.map(row => <tr key={row.key}><th scope="row" className="py-2 text-left font-normal">{row.key}</th><td className="text-right">{number(row.totalOpenings)}</td><td className="text-right">{number(row.probableScans)}</td><td className="text-right">{!complete || row.estimatedUnique === null ? 'Ukendt' : number(row.estimatedUnique)}</td></tr>)}</tbody>
    </table></div>
    {!values.length && <p className="text-sm text-muted-foreground">Ingen hændelser i perioden.</p>}
  </section>;
}

/** Presentation only. The parent owns authorization, query completeness and transport. */
export function QrAnalytics({ metrics, period, codes = [], selection, loading = false, error, complete = false,
  currentLocationOnly, canExport, onFilterChange, onExport, onRetry }: QrAnalyticsProps) {
  const id = useId();
  const [filters, setFilters] = useState<QrAnalyticsFilter>({ ...period, qrId: selection?.qrId ?? '', campaign: selection?.campaign ?? '', placement: selection?.placement ?? '' });
  const [hourly, setHourly] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [filterError, setFilterError] = useState(false);
  useEffect(() => { setFilters({ ...period, qrId: selection?.qrId ?? '', campaign: selection?.campaign ?? '', placement: selection?.placement ?? '' }); },
    [period.dateFrom, period.dateTo, selection?.qrId, selection?.campaign, selection?.placement]);
  const change = (key: keyof QrAnalyticsFilter, value: string) => setFilters(previous => ({ ...previous, [key]: value }));
  const options = (key: 'campaign' | 'placement') => [...new Set(codes.map(code => code[key]).filter((value): value is string => !!value))].sort();
  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!filters.dateFrom || !filters.dateTo || filters.dateFrom > filters.dateTo) { setFilterError(true); return; }
    setFilterError(false); setExportError(false); onFilterChange?.(filters);
  };
  const exportData = async () => {
    if (!canExport || !onExport || !metrics || loading || error || !complete || exporting) return;
    setExporting(true); setExportError(false);
    try { await onExport(); } catch { setExportError(true); } finally { setExporting(false); }
  };
  return <section aria-label="QR-statistik" className="space-y-4" style={{ minWidth: 0 }} aria-busy={loading || exporting}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">QR-statistik</h2>
      {canExport && <button type="button" className={action} onClick={exportData} disabled={!onExport || !metrics || loading || !!error || !complete || exporting}>{exporting ? 'Eksporterer…' : 'Eksportér CSV'}</button>}
    </div>
    <form className={`${box} flex flex-wrap items-end gap-3`} onSubmit={applyFilters} aria-label="Filtrér QR-statistik">
      <label htmlFor={`${id}-from`} className="grid gap-1 text-sm">Fra dato<input id={`${id}-from`} type="date" required className={input} value={filters.dateFrom} onChange={event => change('dateFrom', event.target.value)} /></label>
      <label htmlFor={`${id}-to`} className="grid gap-1 text-sm">Til og med dato<input id={`${id}-to`} type="date" required className={input} value={filters.dateTo} onChange={event => change('dateTo', event.target.value)} /></label>
      <label htmlFor={`${id}-code`} className="grid gap-1 text-sm">QR-kode<select id={`${id}-code`} className={input} value={filters.qrId} onChange={event => change('qrId', event.target.value)}><option value="">Alle QR-koder</option>{codes.map(code => <option key={code.id} value={code.id}>{code.name}</option>)}</select></label>
      <label htmlFor={`${id}-campaign`} className="grid gap-1 text-sm">Kampagne<select id={`${id}-campaign`} aria-describedby={`${id}-metadata`} className={input} value={filters.campaign} onChange={event => change('campaign', event.target.value)}><option value="">Alle kampagner</option>{options('campaign').map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label htmlFor={`${id}-placement`} className="grid gap-1 text-sm">Placering<select id={`${id}-placement`} aria-describedby={`${id}-metadata`} className={input} value={filters.placement} onChange={event => change('placement', event.target.value)}><option value="">Alle placeringer</option>{options('placement').map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <button type="submit" className={action} disabled={!onFilterChange || loading}>Vis statistik</button>
      <p id={`${id}-metadata`} role="note" aria-label="Aktuelle metadata" className="text-sm text-muted-foreground" style={{ flexBasis: '100%' }}>Kampagne og placering filtrerer QR-koder efter deres aktuelle oplysninger. De viser ikke, hvilken kampagne eller placering der gjaldt på scanningstidspunktet. Tabellen nedenfor viser også aktuelle oplysninger.</p>
    </form>
    {filterError && <p role="alert">Vælg en gyldig periode med slutdato efter eller på startdatoen.</p>}
    {loading && <p role="status">Indlæser statistik… Tidligere resultater kan stadig være vist.</p>}
    {error && <div role="alert" className={box}><p>Statistikken kunne ikke indlæses. Eventuelle viste tal er fra den senest indlæste periode.</p>{onRetry && <button type="button" className={action} onClick={onRetry} disabled={loading}>Prøv igen</button>}</div>}
    {exportError && <p role="alert">CSV kunne ikke eksporteres. Prøv igen.</p>}
    {!complete && <p role="alert" className={box}>Ufuldstændige data: Tallene omfatter kun indlæste hændelser og er ikke totalen for perioden. Unikestimat og eksport er derfor ikke tilgængelige.</p>}
    {metrics && <>
      <p className="text-sm text-muted-foreground">Indlæst dataperiode: {dateTime(metrics.from)} til {dateTime(metrics.to)} (sluttidspunktet er ikke med). Alle datoer og timer vises i dansk tid.</p>
      <p role="note" aria-label="Afdelingshistorik" className="text-sm text-muted-foreground">{currentLocationOnly === true
        ? 'Afdelingshistorik: Kun hændelser fra QR-kodens nuværende afdeling er med. Hændelser fra tidligere afdelinger er ikke med.'
        : currentLocationOnly === false
          ? 'Afdelingshistorik: Hændelser fra QR-kodens historiske afdelinger er med i den indlæste periode.'
          : 'Afdelingshistorik: Det er ikke oplyst, hvilke afdelinger de viste tal omfatter.'}</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Registrerede åbninger', number(metrics.totalOpenings)],
          ['Sandsynlige scanninger', number(metrics.probableScans)],
          ['Estimerede unikke', !complete || metrics.estimatedUnique === null ? 'Ukendt' : number(metrics.estimatedUnique)],
          ['Udeladte åbninger', number(metrics.excludedOpenings)],
        ].map(([label, value]) => <div key={label} className={box}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}
      </dl>
      <p className="text-sm text-muted-foreground">Åbninger er registrerede GET-kald. Sandsynlige scanninger udelader kendte bots, forhåndsvisninger og manglende browseroplysninger, men beviser ikke kamerabrug. Unikke er et estimat af besøgsnøgler, ikke personer. {metrics.unidentifiedScans > 0 && `${number(metrics.unidentifiedScans)} scanninger mangler besøgsnøgle; ${number(metrics.knownUnique)} forskellige nøgler er kendt.`} Ingen kunders navn, e-mail eller præcise GPS-position udledes her.</p>
      <label htmlFor={`${id}-group`} className="flex flex-wrap items-center gap-2 text-sm">Tidsopdeling<select id={`${id}-group`} className={input} value={hourly ? 'hour' : 'day'} onChange={event => setHourly(event.target.value === 'hour')}><option value="day">Pr. dag</option><option value="hour">Pr. time</option></select></label>
      <Timeline values={hourly ? metrics.byHour : metrics.byDay} hourly={hourly} complete={complete} />
      <div className="grid gap-4 lg:grid-cols-2"><CountsTable title="Enheder" values={metrics.byDevice}/><CountsTable title="Operativsystemer" values={metrics.byOs}/><CountsTable title="Browsere" values={metrics.byBrowser}/><CountsTable title="Henvisende websites" values={metrics.byReferrer}/></div>
      <section className={box} style={{ minWidth: 0 }}><h3 className="font-medium">QR-koder, kampagner og placeringer</h3><div style={{ overflowX: 'auto' }}><table className="w-full text-sm" aria-label="QR-koder, kampagner og placeringer" aria-describedby={`${id}-metadata`}><thead><tr><th scope="col" className="text-left">QR-kode</th><th scope="col" className="text-left">Kampagne (aktuel)</th><th scope="col" className="text-left">Placering (aktuel)</th><th scope="col" className="text-right">Sandsynlige scanninger</th></tr></thead><tbody>{metrics.byQr.map(row => {
        const code = codes.find(candidate => candidate.id === row.key);
        return <tr key={row.key}><th scope="row" className="py-2 text-left font-normal" style={{ overflowWrap: 'anywhere' }}>{code?.name ?? row.key}</th><td>{code?.campaign || 'Ukendt'}</td><td>{code?.placement || 'Ukendt'}</td><td className="text-right">{number(row.probableScans)}</td></tr>;
      })}</tbody></table></div>{!metrics.byQr.length && <p className="text-sm text-muted-foreground">Ingen hændelser i perioden.</p>}</section>
    </>}
    {!metrics && !loading && !error && <p role="status">Vælg en periode for at indlæse statistik.</p>}
  </section>;
}
