'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { PrinterConfigurationForm } from './printer-configuration-form';
import { PrinterLifecycleDialog } from './printer-lifecycle-dialog';
import { PrinterCredentialsPanel } from './printer-credentials-panel';
import { PrinterActivationPanel } from './printer-activation-panel';
import type { PrinterConfiguration } from '@/lib/printing/domain';

type Brand = { id: string; name: string };
type Location = { id: string; name: string; brandId: string };
type Activity = { activatedAt: number | null; lastConfirmedPrintAt: number | null; printHistory: 'unknown' | 'never' | 'confirmed' };
type Item = { configuration: PrinterConfiguration; revision: number; activity?: Activity };
type Page = { items: Item[]; nextCursor: string | null; totalPrinters?: number };
type Cursor = { locationKey: string; after: string };
type OverviewItem = Item & { totalPrinters?: number };
type OverviewPage = { items: OverviewItem[]; nextCursor: Cursor | null };
type Result = { key: string; page?: OverviewPage; error?: string };
const locationKey = (row: { brandId: string; id: string }) => JSON.stringify([row.brandId, row.id]);
const id = /^[A-Za-z0-9_-]{1,128}$/;
const activityDate = new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Copenhagen' });
const validTimestamp = (value: unknown) => value === null || typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
function validActivity(value: unknown): value is Activity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const activity = value as Activity;
  return Object.keys(value).sort().join(',') === 'activatedAt,lastConfirmedPrintAt,printHistory'
    && validTimestamp(activity.activatedAt) && validTimestamp(activity.lastConfirmedPrintAt)
    && ['unknown', 'never', 'confirmed'].includes(activity.printHistory)
    && (activity.printHistory === 'confirmed') === (activity.lastConfirmedPrintAt !== null);
}
function ActivityTime({ value }: { value: number | null | undefined }) {
  return value == null ? <>Ikke registreret</>
    : <time dateTime={new Date(value).toISOString()} className="whitespace-nowrap">{activityDate.format(value)}</time>;
}

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
      || ![58, 80].includes(c.paperWidthMm) || !Number.isSafeInteger(item.revision) || item.revision < 1
      || (item.activity !== undefined && !validActivity(item.activity))) throw Error('invalid_response');
    seen.add(c.id);
  }
  if (data.nextCursor && (data.items.length !== 20 || data.items[19].configuration.id !== data.nextCursor)) throw Error('invalid_response');
  return data;
}

type Scope = { id: string; brandId: string };
export function PrinterOverview({ brands, locations, createLocations = [], editLocations = [], deleteLocations = [] }: { brands: Brand[]; locations: Location[]; createLocations?: Scope[]; editLocations?: Scope[]; deleteLocations?: Scope[] }) {
  const [brandId, setBrandId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [model, setModel] = useState('');
  const [after, setAfter] = useState<Cursor | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [editor, setEditor] = useState<{ scope: string; brandId: string; locationId: string; item?: Item; action?: 'deactivate' | 'delete' | 'resume' } | null>(null);
  const [credential, setCredential] = useState<{ key: string; item: Item } | null>(null);
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
  const location = locations.find(row => row.id === locationId && (!brandId || row.brandId === brandId));
  const scopes = locations.filter(row => brands.some(brand => brand.id === row.brandId)
    && (!brandId || row.brandId === brandId) && (!locationId || row.id === locationId))
    .sort((a, b) => locationKey(a).localeCompare(locationKey(b)));
  const scope = JSON.stringify([brandId, locationId, scopes.map(locationKey)]);
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const hasGrant = (grants: Scope[], target: { brandId: string; locationId: string }) => !sessionLost
    && locations.some(row => row.id === target.locationId && row.brandId === target.brandId)
    && grants.some(row => row.id === target.locationId && row.brandId === target.brandId);
  const createScope = location && { brandId: location.brandId, locationId: location.id };
  const canCreate = !!createScope && hasGrant(createLocations, createScope);
  const editorAllowed = !!editor && editor.scope === scope && hasGrant(
    editor.action === 'delete' ? deleteLocations : editor.item ? editLocations : createLocations, editor);
  const closeAndRefresh = () => { setFeedback(null); readsAllowed.current = true; setEditor(null); setCredential(null); setAfter(null); setRefresh(value => value + 1); };
  const key = JSON.stringify([scope, after, refresh, model]);
  const current = result?.key === key ? result : null;
  const loseSession = () => { setFeedback(null); readsAllowed.current = false; readGeneration.current += 1; readController.current?.abort(); sessionEpoch.current += 1; setSessionLost(true); setEditor(null); setCredential(null); setSavedScope(''); setResult({ key, error: 'Din session er udløbet. Log ind igen.' }); };
  const credentialAllowed = !!credential && credential.key === key && !editor && !feedback?.requiresRefresh
    && hasGrant(editLocations, credential.item.configuration) && !!current?.page?.items.some(row => row.revision === credential.item.revision
      && row.configuration.id === credential.item.configuration.id && row.configuration.brandId === credential.item.configuration.brandId
      && row.configuration.locationId === credential.item.configuration.locationId);
  const openEditor = (item?: Item, action?: 'deactivate' | 'delete' | 'resume') => {
    const target = item?.configuration || createScope;
    if (!target || editor || credential || feedback?.requiresRefresh || !current?.page || sessionLost
      || !hasGrant(action === 'delete' ? deleteLocations : item ? editLocations : createLocations, target)
      || (item && action !== 'delete' && (action === 'resume' ? item.configuration.state === 'active' : action === 'deactivate'
        ? item.configuration.state === 'disabled' : item.configuration.state !== 'disabled'))) return;
    // Ignore obsolete reads before a revisioned mutation can begin.
    readGeneration.current += 1; readController.current?.abort();
    setFeedback(null); setSavedScope(''); setEditor({ scope, brandId: target.brandId, locationId: target.locationId,
      ...(item ? { item } : {}), ...(action ? { action } : {}) });
  };

  useEffect(() => {
    // A revoked grant blocks new submits immediately, but an accepted server
    // transaction must settle before its form can be removed.
    if (editor && !editorAllowed && !savePendingRef.current) setEditor(null);
  }, [editor, editorAllowed, savePending]);

  useEffect(() => { if (credential && !credentialAllowed) setCredential(null); }, [credential, credentialAllowed]);

  useEffect(() => {
    if (!readsAllowed.current || editor) return;
    const controller = new AbortController(); readController.current = controller;
    const generation = ++readGeneration.current;
    let active = true;
    const epoch = sessionEpoch.current;
    const isCurrent = () => active && !controller.signal.aborted && generation === readGeneration.current && epoch === sessionEpoch.current;
    async function load(): Promise<OverviewPage> {
      const items: OverviewItem[] = [];
      let index = after ? scopes.findIndex(row => locationKey(row) === after.locationKey) : 0;
      if (index < 0) throw Error('invalid_response');
      let cursor = after?.after || '';
      // Bound each page to 20 rows and eight native scope reads. Pagination also
      // traverses empty locations, without an unbounded global collection query.
      for (let reads = 0; index < scopes.length && reads < 8 && items.length < 20; reads++) {
        const target = scopes[index];
        const query = new URLSearchParams({ brandId: target.brandId, locationId: target.id, limit: '20', overview: 'true',
          ...(model ? { model } : {}), ...(cursor ? { after: cursor } : {}) });
        const response = await fetch('/api/merchant/printers?' + query, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        if (!isCurrent()) throw Error('obsolete_read');
        if (response.status === 401 && scopeRef.current === scope) { loseSession(); throw Error('obsolete_read'); }
        if (!response.ok) throw Error(response.status === 403 ? 'Du har ikke adgang til printerne på denne lokation.' : 'Printerne kunne ikke indlæses. Prøv igen.');
        const page = readPage(await response.json(), target.brandId, target.id, cursor, model);
        if (!isCurrent()) throw Error('obsolete_read');
        const remaining = 20 - items.length;
        items.push(...page.items.slice(0, remaining).map(item => ({ ...item, totalPrinters: page.totalPrinters })));
        if (page.items.length > remaining || page.nextCursor) {
          cursor = items[items.length - 1].configuration.id;
          break;
        }
        index++; cursor = '';
      }
      return { items, nextCursor: index < scopes.length ? { locationKey: locationKey(scopes[index]), after: cursor } : null };
    }
    load().then(page => { if (isCurrent()) { setSessionLost(false); setResult({ key, page }); } })
      .catch(error => {
        if (isCurrent()) setResult({ key, error: error instanceof Error
          && /^(Din session|Du har ikke adgang|Printerne kunne)/.test(error.message) ? error.message : 'Printerne kunne ikke indlæses. Prøv igen.' });
      });
    return () => { active = false; controller.abort(); if (readController.current === controller) readController.current = null; };
  }, [brandId, locationId, after, refresh, key, locations, editor, model]);

  const stateLabels = { active: 'Active', paused: 'Deactive · På pause', disabled: 'Deactive' };
  return <div className="space-y-6 min-w-0">
    <header>
      <p className="text-sm font-semibold text-primary">Superadmin · Printerpilot</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Printere</h1>
      <a href="/superadmin/printers/routing" className="mt-2 inline-block text-sm text-primary underline">Routingregler</a>
      <p className="mt-2 text-sm text-muted-foreground">Administrer printeropsætning på tværs af brands og lokationer.</p>
    </header>
    <div className="admin-filter-bar flex flex-wrap items-end gap-3 p-4">
      <AdminSelectField label="Brand" value={brandId} disabled={!!editor} onChange={event => { const nextBrand = event.target.value; setBrandId(nextBrand); if (nextBrand && !locations.some(row => row.id === locationId && row.brandId === nextBrand)) setLocationId(''); setAfter(null); setEditor(null); setSavedScope(''); setFeedback(null); }}>
        <option value="">Alle brands</option>
        {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </AdminSelectField>
      <AdminSelectField label="Lokation" value={locationId} disabled={!!editor} onChange={event => { setLocationId(event.target.value); setAfter(null); setEditor(null); setSavedScope(''); setFeedback(null); }}>
        <option value="">Alle lokationer</option>
        {locations.filter(row => !brandId || row.brandId === brandId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </AdminSelectField>
      <AdminSelectField label="Printertype" value={model} disabled={!!editor} onChange={event => { setModel(event.target.value); setAfter(null); setFeedback(null); }}>
        <option value="">Alle printertyper</option><option value="mc-print2">Star mC-Print2</option><option value="mc-print3">Star mC-Print3</option>
      </AdminSelectField>
      <Button variant="outline" disabled={!!editor} onClick={closeAndRefresh}>
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Opdater
      </Button>
    </div>
    {sessionLost && !current?.error && <p role="alert">Din session er udløbet. Log ind igen.</p>}
    {savedScope && !editor && <p role="status">Printeropsætningen er gemt som deaktiveret.</p>}
    {feedback && !editor && <p role="alert">{feedback.message}</p>}
    {location && canCreate && !feedback?.requiresRefresh && current?.page && !editor && !credential && <Button onClick={() => openEditor()}>Tilføj printer</Button>}
    {credential && credentialAllowed && <PrinterCredentialsPanel
      key={JSON.stringify([credential.key, credential.item.configuration.brandId, credential.item.configuration.locationId, credential.item.configuration.id, credential.item.revision])}
      scope={{ brandId: credential.item.configuration.brandId, locationId: credential.item.configuration.locationId,
        printerId: credential.item.configuration.id, printerRevision: credential.item.revision }} printerName={credential.item.configuration.name}
      pilotProfile={{ model: credential.item.configuration.model, paperWidthMm: credential.item.configuration.paperWidthMm, transport: credential.item.configuration.transport, state: credential.item.configuration.state }}
      permitted={credentialAllowed} onSessionLost={loseSession} onClose={() => setCredential(null)} />}
    {editor && !editor.action && !sessionLost && (editorAllowed || savePending) && <PrinterConfigurationForm
      key={JSON.stringify([editor.scope, editor.item?.configuration.id || '', editor.item?.revision || 0])}
      brandId={editor.brandId} locationId={editor.locationId} item={editor.item} permitted={editorAllowed}
      onPendingChange={reportPending} onCancel={closeAndRefresh}
      onSessionLost={() => { if (editorRef.current === editor) loseSession(); }}
      onFeedback={(message, requiresRefresh) => { if (editorRef.current === editor) {
        setFeedback({ message, requiresRefresh }); if (requiresRefresh) readsAllowed.current = false;
      } }}
      onSaved={() => { if (editorRef.current === editor) { setSavedScope(editor.scope); closeAndRefresh(); } }} />}
    {editor?.item && editor.action === 'resume' && !sessionLost && (editorAllowed || savePending) && <PrinterActivationPanel
      key={JSON.stringify([editor.scope, editor.item.configuration.id, editor.item.revision, editor.action])}
      item={editor.item} permitted={editorAllowed} onPendingChange={reportPending} onCancel={closeAndRefresh}
      onSessionLost={() => { if (editorRef.current === editor) loseSession(); }}
      onSaved={() => { if (editorRef.current === editor) { closeAndRefresh(); setFeedback({ requiresRefresh: false,
        message: 'Printeren er aktiveret. Åbn Printeradgang, erstat adgangskoden, og start derefter et nyt testforløb.' }); } }} />}
    {editor?.item && editor.action && editor.action !== 'resume' && !sessionLost && (editorAllowed || savePending) && <PrinterLifecycleDialog
      key={JSON.stringify([editor.scope, editor.item.configuration.id, editor.item.revision, editor.action])}
      item={editor.item} action={editor.action} permitted={editorAllowed} onPendingChange={reportPending} onCancel={closeAndRefresh}
      onSessionLost={() => { if (editorRef.current === editor) loseSession(); }}
      onFeedback={(message, requiresRefresh) => { if (editorRef.current === editor) { setFeedback({ message, requiresRefresh }); if (requiresRefresh) readsAllowed.current = false; } }}
      onSaved={() => { if (editorRef.current === editor) closeAndRefresh(); }} />}
    <section aria-label="Printeroversigt" aria-busy={!current && !editor} className="space-y-4">
      <div className="min-w-0 max-w-full rounded-lg border overflow-hidden">
        <Table aria-label="Printere" className="min-w-[1100px]">
          <TableHeader><TableRow>{['Aktiveringsdato', 'Brand', 'Lokation', 'Status', 'Last used', 'Total printers', 'Printer name', 'Printertype', 'Handlinger'].map(label => <TableHead key={label} scope="col">{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {!current ? <TableRow><TableCell colSpan={9}><p role="status">Indlæser printere…</p></TableCell></TableRow>
              : current.error ? <TableRow><TableCell colSpan={9}><p role="alert">{current.error}</p></TableCell></TableRow>
              : !current.page?.items.length ? <TableRow><TableCell colSpan={9}>{!locations.length
                ? 'Ingen lokationer med adgang til printeroversigten.' : location
                  ? model ? 'Ingen printere af denne type på lokationen.' : 'Ingen printere på denne lokation.'
                  : 'Ingen printere matcher filtrene på denne side.'}</TableCell></TableRow>
              : current.page.items.map(({ configuration: c, revision, totalPrinters, activity }) => {
                const canEdit = hasGrant(editLocations, c), canDelete = hasGrant(deleteLocations, c);
                return <TableRow key={JSON.stringify([c.brandId, c.locationId, c.id])}>
                  <TableCell><ActivityTime value={activity?.activatedAt} /></TableCell>
                  <TableCell>{brands.find(row => row.id === c.brandId)?.name}</TableCell>
                  <TableCell>{locations.find(row => row.id === c.locationId && row.brandId === c.brandId)?.name}</TableCell>
                  <TableCell><span className="whitespace-nowrap">{stateLabels[c.state]}</span></TableCell>
                  <TableCell>{activity?.printHistory === 'never' ? 'Aldrig printet'
                    : <ActivityTime value={activity?.lastConfirmedPrintAt} />}</TableCell><TableCell>{totalPrinters ?? 'Ikke registreret'}</TableCell>
                  <TableCell className="max-w-[220px] break-words font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground"><span className="whitespace-nowrap">Star {c.model === 'mc-print2' ? 'mC-Print2' : 'mC-Print3'}</span><br />{c.transport === 'cloudprnt-http' ? 'CloudPRNT HTTP' : 'CloudPRNT MQTT'}<br />{c.paperWidthMm} mm</TableCell>
                  <TableCell><div className="flex flex-wrap gap-2 min-w-[180px]">
                    <Button aria-label={`Aktivér ${c.name}`} size="sm" variant="outline" disabled={!canEdit || !!editor || !!credential || !!feedback?.requiresRefresh || c.state === 'active'} onClick={() => openEditor({ configuration: c, revision }, 'resume')}>Aktivér</Button>
                    <Button aria-label={`Rediger ${c.name}`} title={!canEdit ? 'Ingen redigeringsadgang på denne lokation' : undefined} size="sm" variant="outline" disabled={!canEdit || !!editor || !!credential || !!feedback?.requiresRefresh || c.state !== 'disabled'} onClick={() => openEditor({ configuration: c, revision })}>Edit</Button>
                    <Button aria-label={`Deaktiver ${c.name}`} title={!canEdit ? 'Ingen redigeringsadgang på denne lokation' : undefined} size="sm" variant="outline" disabled={!canEdit || !!editor || !!credential || !!feedback?.requiresRefresh || c.state === 'disabled'} onClick={() => openEditor({ configuration: c, revision }, 'deactivate')}>Deactivate</Button>
                    <Button aria-label={`Slet ${c.name}`} title={!canDelete ? 'Ingen sletteadgang på denne lokation' : undefined} size="sm" variant="outline" disabled={!canDelete || !!editor || !!credential || !!feedback?.requiresRefresh} onClick={() => openEditor({ configuration: c, revision }, 'delete')}>Delete</Button>
                    <Button aria-label={`Printeradgang ${c.name}`} title={!canEdit ? 'Ingen redigeringsadgang på denne lokation' : undefined} size="sm" variant="outline" disabled={!canEdit || !!editor || !!credential || !!feedback?.requiresRefresh}
                      onClick={() => { if (canEdit && !editor && !credential && current?.page && !feedback?.requiresRefresh) setCredential({ key, item: { configuration: c, revision } }); }}>Printeradgang</Button>
                  </div></TableCell>
                </TableRow>;
              })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Total printers er alle ikke-slettede printere på rækkens brand og lokation, uanset printertype. Datoer vises i dansk tid. Aktiveringsdato er seneste registrerede aktivering i systemet. Last used kræver et bekræftet print; ukendt historik vises som Ikke registreret. Tabellen kan rulles vandret.</p>
      <div className="flex flex-wrap gap-3">
        {after && <Button variant="outline" disabled={!!editor} onClick={() => setAfter(null)}>Første side</Button>}
        {current?.page?.nextCursor && <Button variant="outline" disabled={!!editor} onClick={() => setAfter(current.page!.nextCursor!)}>Næste side</Button>}
      </div>
    </section>
  </div>;
}
