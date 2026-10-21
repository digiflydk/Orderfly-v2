'use client';

import { useEffect, useRef, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { PrinterConfigurationForm } from './printer-configuration-form';
import type { PrinterConfiguration } from '@/lib/printing/domain';

type Brand = { id: string; name: string };
type Location = { id: string; name: string; brandId: string };
type Item = { configuration: PrinterConfiguration; revision: number };
type Page = { items: Item[]; nextCursor: string | null };
type Result = { key: string; page?: Page; error?: string };
const id = /^[A-Za-z0-9_-]{1,128}$/;

// Fail closed on malformed or foreign responses before rendering any row.
function readPage(value: unknown, brandId: string, locationId: string, after: string): Page {
  const data = value as Page;
  if (!data || !Array.isArray(data.items) || data.items.length > 20
    || !(data.nextCursor === null || typeof data.nextCursor === 'string' && id.test(data.nextCursor) && data.nextCursor !== after)) throw Error('invalid_response');
  const seen = new Set<string>();
  for (const item of data.items) {
    const c = item?.configuration;
    if (!c || !id.test(c.id) || seen.has(c.id) || c.brandId !== brandId || c.locationId !== locationId
      || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 80
      || c.manufacturer !== 'star' || !['mc-print2', 'mc-print3'].includes(c.model)
      || !['cloudprnt-http', 'cloudprnt-mqtt'].includes(c.transport) || !['active', 'paused', 'disabled'].includes(c.state)
      || ![58, 80].includes(c.paperWidthMm) || !Number.isSafeInteger(item.revision) || item.revision < 1) throw Error('invalid_response');
    seen.add(c.id);
  }
  if (data.nextCursor && (data.items.length !== 20 || data.items[19].configuration.id !== data.nextCursor)) throw Error('invalid_response');
  return data;
}

type Scope = { id: string; brandId: string };
export function PrinterOverview({ brands, locations, createLocations = [], editLocations = [] }: { brands: Brand[]; locations: Location[]; createLocations?: Scope[]; editLocations?: Scope[] }) {
  const [brandId, setBrandId] = useState(brands.length === 1 ? brands[0].id : '');
  const [locationId, setLocationId] = useState('');
  const [after, setAfter] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [editor, setEditor] = useState<{ scope: string; item?: Item } | null>(null);
  const [sessionLost, setSessionLost] = useState(false);
  const sessionEpoch = useRef(0);
  const readGeneration = useRef(0);
  const readsAllowed = useRef(true);
  const readController = useRef<AbortController | null>(null);
  const [savedScope, setSavedScope] = useState('');
  const location = locations.find(row => row.id === locationId && row.brandId === brandId);
  const scope = JSON.stringify([brandId, location?.id || '']);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const canCreate = !sessionLost && createLocations.some(row => row.id === location?.id && row.brandId === brandId);
  const canEdit = !sessionLost && editLocations.some(row => row.id === location?.id && row.brandId === brandId);
  const closeAndRefresh = () => { readsAllowed.current = true; setEditor(null); setAfter(''); setRefresh(value => value + 1); };
  const loseSession = () => { readsAllowed.current = false; readGeneration.current += 1; readController.current?.abort(); sessionEpoch.current += 1; setSessionLost(true); setEditor(null); setSavedScope(''); setResult({ key, error: 'Din session er udløbet. Log ind igen.' }); };
  const key = JSON.stringify([brandId, location?.id || '', after, refresh]);
  const current = result?.key === key ? result : null;
  const openEditor = (item?: Item) => {
    if (editor || !current?.page || sessionLost || (item ? !canEdit || item.configuration.state !== 'disabled' : !canCreate)) return;
    // Invalidate synchronously, before React effects run: an older GET401 must
    // never close a new editor or abort an already authenticated save.
    readGeneration.current += 1; readController.current?.abort();
    setSavedScope(''); setEditor({ scope, ...(item ? { item } : {}) });
  };

  useEffect(() => {
    if (editor && (!location || editor.scope !== scope || (editor.item ? !canEdit : !canCreate))) setEditor(null);
  }, [editor, location, scope, canCreate, canEdit]);

  useEffect(() => {
    if (!readsAllowed.current || editor || !brandId || !locationId || !locations.some(row => row.id === locationId && row.brandId === brandId)) return;
    const controller = new AbortController(); readController.current = controller;
    const generation = ++readGeneration.current;
    let active = true;
    const epoch = sessionEpoch.current;
    const isCurrent = () => active && !controller.signal.aborted && generation === readGeneration.current && epoch === sessionEpoch.current;
    const query = new URLSearchParams({ brandId, locationId, limit: '20', ...(after ? { after } : {}) });
    fetch('/api/merchant/printers?' + query, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        if (response.status === 401 && isCurrent() && scopeRef.current === scope) loseSession();
        if (!response.ok) throw Error(response.status === 401 ? 'Din session er udløbet. Log ind igen.'
          : response.status === 403 ? 'Du har ikke adgang til printerne på denne lokation.'
          : 'Printerne kunne ikke indlæses. Prøv igen.');
        return readPage(await response.json(), brandId, locationId, after);
      })
      .then(page => { if (isCurrent()) { setSessionLost(false); setResult({ key, page }); } })
      .catch(error => {
        if (isCurrent()) {
          if (sessionLost) readsAllowed.current = false;
          setResult({ key, error: error instanceof Error && error.message !== 'invalid_response'
          && /^(Din session|Du har ikke adgang|Printerne kunne)/.test(error.message) ? error.message : 'Printerne kunne ikke indlæses. Prøv igen.' });
        }
      });
    return () => { active = false; controller.abort(); if (readController.current === controller) readController.current = null; };
  }, [brandId, locationId, after, refresh, key, locations, editor]);

  const stateLabels = { active: 'Aktiv', paused: 'På pause', disabled: 'Deaktiveret' };
  return <div className="space-y-6 min-w-0">
    <header>
      <p className="text-sm font-semibold text-primary">Restaurantens udstyr</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Printere</h1>
      <p className="mt-2 text-sm text-muted-foreground">Se printeropsætningen for dit brand og din lokation.</p>
    </header>
    <div className="admin-filter-bar flex flex-wrap items-end gap-3 p-4">
      <AdminSelectField label="Brand" value={brandId} disabled={!!editor} onChange={event => { setBrandId(event.target.value); setLocationId(''); setAfter(''); setEditor(null); setSavedScope(''); }}>
        <option value="">Vælg brand</option>
        {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </AdminSelectField>
      <AdminSelectField label="Lokation" value={locationId} disabled={!brandId || !!editor} onChange={event => { setLocationId(event.target.value); setAfter(''); setEditor(null); setSavedScope(''); }}>
        <option value="">Vælg lokation</option>
        {locations.filter(row => row.brandId === brandId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </AdminSelectField>
      <Button variant="outline" disabled={!location || !!editor} onClick={closeAndRefresh}>
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Opdater
      </Button>
    </div>
    {sessionLost && !current?.error && <p role="alert">Din session er udløbet. Log ind igen.</p>}
    {savedScope === scope && <p role="status">Printeropsætningen er gemt som deaktiveret.</p>}
    {location && canCreate && current?.page && !editor && <Button onClick={() => openEditor()}>Tilføj printer</Button>}
    {location && !sessionLost && editor?.scope === scope && (editor.item ? canEdit : canCreate) && <PrinterConfigurationForm
      key={JSON.stringify([scope, editor.item?.configuration.id || '', editor.item?.revision || 0])}
      brandId={brandId} locationId={location.id} item={editor.item}
      onCancel={closeAndRefresh} onSessionLost={() => { if (scopeRef.current === scope) loseSession(); }}
      onSaved={() => { if (scopeRef.current === scope) { setSavedScope(scope); closeAndRefresh(); } }} />}
    {!locations.length ? <p>Ingen lokationer med adgang til printeroversigten.</p>
      : !location ? <p>Vælg brand og lokation for at se printerne.</p>
      : <section aria-label="Printeroversigt" aria-busy={!current} className="space-y-4">
        <p className="text-sm text-muted-foreground">{location.name}</p>
        {!current ? <p role="status">Indlæser printere…</p>
          : current.error ? <p role="alert">{current.error}</p>
          : <>
            {!current.page?.items.length ? <p>Ingen printere på denne lokation.</p> : <div className="grid gap-4 md:grid-cols-2">
              {current.page.items.map(({ configuration: c, revision }) => <Card key={c.id} className="min-w-0">
                <CardHeader><CardTitle className="flex items-start gap-2 text-lg"><Printer className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><span className="break-words min-w-0">{c.name}</span></CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <dt className="text-muted-foreground">Driftsstatus</dt><dd>{stateLabels[c.state]}</dd>
                    <dt className="text-muted-foreground">Forbindelse</dt><dd>Ikke verificeret</dd>
                    <dt className="text-muted-foreground">Model</dt><dd>Star {c.model === 'mc-print2' ? 'mC-Print2' : 'mC-Print3'}</dd>
                    <dt className="text-muted-foreground">Transport</dt><dd>{c.transport === 'cloudprnt-http' ? 'CloudPRNT HTTP' : 'CloudPRNT MQTT'}</dd>
                    <dt className="text-muted-foreground">Papirbredde</dt><dd>{c.paperWidthMm} mm</dd>
                    <dt className="text-muted-foreground">Revision</dt><dd>{revision}</dd>
                  </dl>
                  {canEdit && c.state === 'disabled' && <Button className="h-auto max-w-full whitespace-normal break-words text-left" variant="outline" disabled={!!editor} onClick={() => openEditor({ configuration: c, revision })}>Rediger {c.name}</Button>}
                  <p className="text-xs text-muted-foreground">Opsætningen viser ikke, om printeren er online eller har udskrevet en bon.</p>
                </CardContent>
              </Card>)}
            </div>}
            <div className="flex flex-wrap gap-3">
              {after && <Button variant="outline" disabled={!!editor} onClick={() => setAfter('')}>Første side</Button>}
              {current.page?.nextCursor && <Button variant="outline" disabled={!!editor} onClick={() => setAfter(current.page!.nextCursor!)}>Næste side</Button>}
            </div>
          </>}
      </section>}
  </div>;
}
