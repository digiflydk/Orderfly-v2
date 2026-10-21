'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { PrinterConfigurationForm } from './printer-configuration-form';
import { PrinterLifecycleDialog } from './printer-lifecycle-dialog';
import type { PrinterConfiguration } from '@/lib/printing/domain';

type Brand = { id: string; name: string };
type Location = { id: string; name: string; brandId: string };
type Item = { configuration: PrinterConfiguration; revision: number };
type Page = { items: Item[]; nextCursor: string | null; totalPrinters?: number };
type Result = { key: string; page?: Page; error?: string };
const id = /^[A-Za-z0-9_-]{1,128}$/;

// Fail closed on malformed or foreign responses before rendering any row.
function readPage(value: unknown, brandId: string, locationId: string, after: string, model: string): Page {
  const data = value as Page;
  if (!data || !Array.isArray(data.items) || data.items.length > 20
    || !(data.nextCursor === null || typeof data.nextCursor === 'string' && id.test(data.nextCursor) && data.nextCursor !== after)) throw Error('invalid_response');
  if (data.totalPrinters !== undefined && (!Number.isSafeInteger(data.totalPrinters) || data.totalPrinters < data.items.length)) throw Error('invalid_response');
  const seen = new Set<string>();
  for (const item of data.items) {
    const c = item?.configuration;
    if (!c || !id.test(c.id) || seen.has(c.id) || (model && c.model !== model) || c.brandId !== brandId || c.locationId !== locationId
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
export function PrinterOverview({ brands, locations, createLocations = [], editLocations = [], deleteLocations = [] }: { brands: Brand[]; locations: Location[]; createLocations?: Scope[]; editLocations?: Scope[]; deleteLocations?: Scope[] }) {
  const [brandId, setBrandId] = useState(brands.length === 1 ? brands[0].id : '');
  const [locationId, setLocationId] = useState('');
  const [model, setModel] = useState('');
  const [after, setAfter] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [editor, setEditor] = useState<{ scope: string; brandId: string; locationId: string; item?: Item; action?: 'deactivate' | 'delete' } | null>(null);
  const [sessionLost, setSessionLost] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const savePendingRef = useRef(false);
  const editorRef = useRef(editor); editorRef.current = editor;
  const [feedback, setFeedback] = useState<{ message: string; requiresRefresh: boolean } | null>(null);
  const reportPending = useCallback((pending: boolean) => { savePendingRef.current = pending; setSavePending(pending); }, []);
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
  const canDelete = !sessionLost && deleteLocations.some(row => row.id === location?.id && row.brandId === brandId);
  const editorAllowed = !!editor && !!location && editor.scope === scope && (editor.action === 'delete' ? canDelete : editor.item ? canEdit : canCreate);
  const closeAndRefresh = () => { setFeedback(null); readsAllowed.current = true; setEditor(null); setAfter(''); setRefresh(value => value + 1); };
  const loseSession = () => { setFeedback(null); readsAllowed.current = false; readGeneration.current += 1; readController.current?.abort(); sessionEpoch.current += 1; setSessionLost(true); setEditor(null); setSavedScope(''); setResult({ key, error: 'Din session er udløbet. Log ind igen.' }); };
  const key = JSON.stringify([brandId, location?.id || '', after, refresh, model]);
  const current = result?.key === key ? result : null;
  const openEditor = (item?: Item, action?: 'deactivate' | 'delete') => {
    if (editor || feedback?.requiresRefresh || !current?.page || sessionLost || (action === 'delete' ? !canDelete : item ? !canEdit || (action === 'deactivate' ? item.configuration.state === 'disabled' : item.configuration.state !== 'disabled') : !canCreate)) return;
    // Invalidate synchronously, before React effects run: an older GET401 must
    // never close a new editor or abort an already authenticated save.
    readGeneration.current += 1; readController.current?.abort();
    setFeedback(null); setSavedScope(''); setEditor({ scope, brandId, locationId, ...(item ? { item } : {}), ...(action ? { action } : {}) });
  };

  useEffect(() => {
    // A revoked grant blocks new submits immediately, but an accepted server
    // transaction must settle before its form can be removed.
    if (editor && !editorAllowed && !savePendingRef.current) setEditor(null);
  }, [editor, editorAllowed, savePending]);

  useEffect(() => {
    if (!readsAllowed.current || editor || !brandId || !locationId || !locations.some(row => row.id === locationId && row.brandId === brandId)) return;
    const controller = new AbortController(); readController.current = controller;
    const generation = ++readGeneration.current;
    let active = true;
    const epoch = sessionEpoch.current;
    const isCurrent = () => active && !controller.signal.aborted && generation === readGeneration.current && epoch === sessionEpoch.current;
    const query = new URLSearchParams({ brandId, locationId, limit: '20', overview: 'true', ...(model ? { model } : {}), ...(after ? { after } : {}) });
    fetch('/api/merchant/printers?' + query, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        if (response.status === 401 && isCurrent() && scopeRef.current === scope) loseSession();
        if (!response.ok) throw Error(response.status === 401 ? 'Din session er udløbet. Log ind igen.'
          : response.status === 403 ? 'Du har ikke adgang til printerne på denne lokation.'
          : 'Printerne kunne ikke indlæses. Prøv igen.');
        return readPage(await response.json(), brandId, locationId, after, model);
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
  }, [brandId, locationId, after, refresh, key, locations, editor, model]);

  const stateLabels = { active: 'Active', paused: 'Deactive · På pause', disabled: 'Deactive' };
  return <div className="space-y-6 min-w-0">
    <header>
      <p className="text-sm font-semibold text-primary">Superadmin · Printerpilot</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Printere</h1>
      <p className="mt-2 text-sm text-muted-foreground">Administrer printeropsætning på tværs af brands og lokationer.</p>
    </header>
    <div className="admin-filter-bar flex flex-wrap items-end gap-3 p-4">
      <AdminSelectField label="Brand" value={brandId} disabled={!!editor} onChange={event => { setBrandId(event.target.value); setLocationId(''); setModel(''); setAfter(''); setEditor(null); setSavedScope(''); setFeedback(null); }}>
        <option value="">Vælg brand</option>
        {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </AdminSelectField>
      <AdminSelectField label="Lokation" value={locationId} disabled={!brandId || !!editor} onChange={event => { setLocationId(event.target.value); setAfter(''); setEditor(null); setSavedScope(''); setFeedback(null); }}>
        <option value="">Vælg lokation</option>
        {locations.filter(row => row.brandId === brandId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </AdminSelectField>
      <AdminSelectField label="Printertype" value={model} disabled={!location || !!editor} onChange={event => { setModel(event.target.value); setAfter(''); setFeedback(null); }}>
        <option value="">Alle printertyper</option><option value="mc-print2">Star mC-Print2</option><option value="mc-print3">Star mC-Print3</option>
      </AdminSelectField>
      <Button variant="outline" disabled={!location || !!editor} onClick={closeAndRefresh}>
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Opdater
      </Button>
    </div>
    {sessionLost && !current?.error && <p role="alert">Din session er udløbet. Log ind igen.</p>}
    {savedScope && !editor && <p role="status">Printeropsætningen er gemt som deaktiveret.</p>}
    {feedback && !editor && <p role="alert">{feedback.message}</p>}
    {location && canCreate && !feedback?.requiresRefresh && current?.page && !editor && <Button onClick={() => openEditor()}>Tilføj printer</Button>}
    {editor && !editor.action && !sessionLost && (editorAllowed || savePending) && <PrinterConfigurationForm
      key={JSON.stringify([editor.scope, editor.item?.configuration.id || '', editor.item?.revision || 0])}
      brandId={editor.brandId} locationId={editor.locationId} item={editor.item} permitted={editorAllowed}
      onPendingChange={reportPending} onCancel={closeAndRefresh}
      onSessionLost={() => { if (editorRef.current === editor) loseSession(); }}
      onFeedback={(message, requiresRefresh) => { if (editorRef.current === editor) {
        setFeedback({ message, requiresRefresh }); if (requiresRefresh) readsAllowed.current = false;
      } }}
      onSaved={() => { if (editorRef.current === editor) { setSavedScope(editor.scope); closeAndRefresh(); } }} />}
    {editor?.item && editor.action && !sessionLost && (editorAllowed || savePending) && <PrinterLifecycleDialog
      key={JSON.stringify([editor.scope, editor.item.configuration.id, editor.item.revision, editor.action])}
      item={editor.item} action={editor.action} permitted={editorAllowed} onPendingChange={reportPending} onCancel={closeAndRefresh}
      onSessionLost={() => { if (editorRef.current === editor) loseSession(); }}
      onFeedback={(message, requiresRefresh) => { if (editorRef.current === editor) { setFeedback({ message, requiresRefresh }); if (requiresRefresh) readsAllowed.current = false; } }}
      onSaved={() => { if (editorRef.current === editor) closeAndRefresh(); }} />}
    {!locations.length ? <p>Ingen lokationer med adgang til printeroversigten.</p>
      : !location ? <p>Vælg brand og lokation for at se printerne.</p>
      : <section aria-label="Printeroversigt" aria-busy={!current} className="space-y-4">
        <p className="text-sm text-muted-foreground">{location.name}</p>
        {!current ? <p role="status">Indlæser printere…</p>
          : current.error ? <p role="alert">{current.error}</p>
          : <>
            {!current.page?.items.length ? <p>{model ? 'Ingen printere af denne type på lokationen.' : 'Ingen printere på denne lokation.'}</p> : <div className="min-w-0 max-w-full rounded-lg border overflow-hidden">
              <Table aria-label="Printere" className="min-w-[1100px]">
                <TableHeader><TableRow>{['Aktiveringsdato', 'Brand', 'Lokation', 'Status', 'Last used', 'Total printers', 'Printer name', 'Printertype', 'Handlinger'].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader>
                <TableBody>{current.page.items.map(({ configuration: c, revision }) => <TableRow key={c.id}>
                  <TableCell>Ikke registreret</TableCell>
                  <TableCell>{brands.find(row => row.id === c.brandId)?.name}</TableCell><TableCell>{location.name}</TableCell>
                  <TableCell><span className="whitespace-nowrap">{stateLabels[c.state]}</span></TableCell>
                  <TableCell>Ikke registreret</TableCell><TableCell>{current.page?.totalPrinters ?? 'Ikke registreret'}</TableCell>
                  <TableCell className="max-w-[220px] break-words font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground"><span className="whitespace-nowrap">Star {c.model === 'mc-print2' ? 'mC-Print2' : 'mC-Print3'}</span><br />{c.transport === 'cloudprnt-http' ? 'CloudPRNT HTTP' : 'CloudPRNT MQTT'}<br />{c.paperWidthMm} mm</TableCell>
                  <TableCell><div className="flex flex-wrap gap-2 min-w-[180px]">
                    {canEdit && <Button aria-label={`Rediger ${c.name}`} size="sm" variant="outline" disabled={!!editor || !!feedback?.requiresRefresh || !canEdit || c.state !== 'disabled'} onClick={() => openEditor({ configuration: c, revision })}>Edit</Button>}
                    {canEdit && <Button aria-label={`Deaktiver ${c.name}`} size="sm" variant="outline" disabled={!!editor || !!feedback?.requiresRefresh || !canEdit || c.state === 'disabled'} onClick={() => openEditor({ configuration: c, revision }, 'deactivate')}>Deactivate</Button>}
                    {canDelete && <Button aria-label={`Slet ${c.name}`} size="sm" variant="outline" disabled={!!editor || !!feedback?.requiresRefresh || !canDelete} onClick={() => openEditor({ configuration: c, revision }, 'delete')}>Delete</Button>}
                  </div></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div>}
            <p className="text-xs text-muted-foreground">Aktivering og seneste bekræftede print er ikke registreret i den nuværende historik. Status bekræfter ikke forbindelse eller udskrift. Total printers er alle ikke-slettede printere på det valgte brand og lokation, uanset printertype. Tabellen kan rulles vandret.</p>
            <div className="flex flex-wrap gap-3">
              {after && <Button variant="outline" disabled={!!editor} onClick={() => setAfter('')}>Første side</Button>}
              {current.page?.nextCursor && <Button variant="outline" disabled={!!editor} onClick={() => setAfter(current.page!.nextCursor!)}>Næste side</Button>}
            </div>
          </>}
      </section>}
  </div>;
}
