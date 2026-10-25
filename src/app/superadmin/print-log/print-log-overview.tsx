'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

type Brand = { id: string; name: string };
type Location = { id: string; name: string; brandId: string };
type Status = 'queued' | 'offered' | 'download_started' | 'confirmed' | 'failed' | 'unknown' | 'expired';
type Item = { id: string; brandId: string; locationId: string; locationName: string; printerId: string; printerName: string;
  orderId: string; kind: 'kitchen' | 'customer' | 'packing'; source: 'automatic' | 'manual'; status: Status;
  createdAt: number; updatedAt: number; error: string | null };
type LogPage = { items: Item[]; nextCursor: string | null };
const statusLabels: Record<Status, string> = { queued: 'I kø', offered: 'Tilbudt printer', download_started: 'Overførsel startet',
  confirmed: 'Bekræftet af printer', failed: 'Fejlet', unknown: 'Ukendt resultat', expired: 'Udløbet' };
const kindLabels = { kitchen: 'Køkkenbon', customer: 'Kundekvittering', packing: 'Pakkebon' };
const date = new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Copenhagen' });
const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
function readPage(value: unknown, brandId: string, cursor: string): LogPage {
  const data = value as LogPage;
  if (!data || !Array.isArray(data.items) || data.items.length > 25
    || !(data.nextCursor === null || typeof data.nextCursor === 'string' && data.nextCursor.length > 0 && data.nextCursor.length <= 16000 && data.nextCursor !== cursor)) throw Error('invalid_response');
  const seen = new Set<string>();
  for (const row of data.items) {
    if (!row || typeof row.id !== 'string' || !row.id || row.id.length > 512 || seen.has(row.id) || row.brandId !== brandId
      || !identifier.test(row.locationId) || !identifier.test(row.printerId) || !identifier.test(row.orderId)
      || typeof row.locationName !== 'string' || row.locationName.length > 256 || typeof row.printerName !== 'string' || row.printerName.length > 256
      || !Object.hasOwn(statusLabels, row.status) || !Object.hasOwn(kindLabels, row.kind) || !['automatic', 'manual'].includes(row.source)
      || !timestamp(row.createdAt) || !timestamp(row.updatedAt) || !(row.error === null || typeof row.error === 'string' && row.error.length <= 1000)) throw Error('invalid_response');
    seen.add(row.id);
  }
  return data;
}
function Time({ value }: { value: number }) {
  return <time className="whitespace-nowrap" dateTime={new Date(value).toISOString()}>{date.format(value)}</time>;
}

export function PrintLogOverview({ brands, locations }: { brands: Brand[]; locations: Location[] }) {
  const [brandId, setBrandId] = useState(brands.length === 1 ? brands[0].id : '');
  const [cursors, setCursors] = useState<string[]>(['']);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; page?: LogPage; error?: string } | null>(null);
  const cursor = cursors[cursors.length - 1];
  const key = JSON.stringify([brandId, cursor, refresh]);
  const current = result?.key === key ? result : null;
  const loading = !!brandId && !current;
  useEffect(() => {
    if (!brandId) return;
    let active = true;
    const controller = new AbortController();
    const params = new URLSearchParams({ brandId, limit: '25' });
    if (cursor) params.set('cursor', cursor);
    void (async () => {
      try {
        const response = await fetch(`/api/superadmin/print-log?${params}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw Error('access');
          const failure = await response.json().catch(() => null);
          throw Error(failure?.error === 'print_log_scope_too_large' ? 'scope_too_large' : 'unavailable');
        }
        const page = readPage(await response.json(), brandId, cursor);
        if (active) setResult({ key, page });
      } catch (error) {
        if (active) setResult({ key, error: error instanceof Error && error.message === 'access'
          ? 'Du har ikke adgang til printloggen. Log ind igen som superadmin.'
          : error instanceof Error && error.message === 'scope_too_large'
            ? 'Dette brand har flere lokationer eller printere, end printloggen kan vise samlet. Kontakt support for at få udvidet oversigten.'
            : 'Printloggen kunne ikke indlæses. Prøv at opdatere igen.' });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [brandId, cursor, key]);
  const changeBrand = (value: string) => { setBrandId(value); setCursors(['']); setResult(null); };
  return <section className="space-y-6 min-w-0" aria-labelledby="print-log-title">
    <div><h1 id="print-log-title" className="text-2xl font-semibold">Print log</h1>
      <p className="text-sm text-muted-foreground mt-1">Se automatiske print og manuelle genprint pr. brand.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <AdminSelectField label="Brand" aria-label="Brand" value={brandId} onChange={event => changeBrand(event.target.value)}>
        <option value="">Vælg brand</option>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </AdminSelectField>
      <Button variant="outline" disabled={!brandId || loading} onClick={() => { setCursors(['']); setRefresh(value => value + 1); }}>
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Opdater
      </Button>
    </div>
    <p className="text-sm text-muted-foreground">“Bekræftet af printer” betyder, at printeren har kvitteret for jobbet. Overførsel alene bekræfter ikke et fysisk print. Tidspunkter vises i dansk tid.</p>
    {!brandId && <p>Vælg et brand for at se printloggen.</p>}
    {loading && <p role="status">Indlæser printlog…</p>}
    {current?.error && <p role="alert" className="text-destructive">{current.error}</p>}
    {current?.page && <>
      {current.page.items.length === 0 ? <p>Ingen printjob på denne side.</p> : <div className="rounded-md border overflow-x-auto">
        <Table aria-label="Printjob">
          <TableHeader><TableRow><TableHead>Oprettet</TableHead><TableHead>Ordre</TableHead><TableHead>Lokation / printer</TableHead><TableHead>Printtype</TableHead><TableHead>Status</TableHead><TableHead>Senest opdateret</TableHead><TableHead>Fejl</TableHead></TableRow></TableHeader>
          <TableBody>{current.page.items.map(row => <TableRow key={row.id}>
            <TableCell><Time value={row.createdAt} /></TableCell>
            <TableCell><a className="font-medium underline underline-offset-4 whitespace-nowrap" href={`/superadmin/sales/orders/${encodeURIComponent(row.orderId)}/${row.kind === 'customer' ? 'receipt' : 'kitchen-receipt'}`}>{row.orderId}</a></TableCell>
            <TableCell><span className="block">{row.locationName || locations.find(location => location.id === row.locationId && location.brandId === brandId)?.name || row.locationId}</span><span className="text-sm text-muted-foreground">{row.printerName || row.printerId}</span></TableCell>
            <TableCell><span className="block whitespace-nowrap">{kindLabels[row.kind]}</span><span className="text-sm text-muted-foreground">{row.source === 'manual' ? 'Manuelt genprint' : 'Automatisk'}</span></TableCell>
            <TableCell><span className={`inline-block rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap ${row.status === 'confirmed' ? 'bg-green-100 text-green-900' : row.status === 'failed' ? 'bg-red-100 text-red-900' : 'bg-muted text-foreground'}`}>{statusLabels[row.status]}</span></TableCell>
            <TableCell><Time value={row.updatedAt} /></TableCell>
            <TableCell className="min-w-[160px] max-w-[320px] break-words">{row.error || '—'}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={cursors.length === 1} onClick={() => setCursors(value => value.slice(0, -1))}>Forrige</Button>
        <span className="text-sm">Side {cursors.length}</span>
        <Button variant="outline" disabled={!current.page.nextCursor} onClick={() => { const next = current.page?.nextCursor; if (next) setCursors(value => [...value, next]); }}>Næste</Button>
      </div>
    </>}
  </section>;
}
