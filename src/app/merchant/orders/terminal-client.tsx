'use client';
import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
import { KdsSettingsForm } from './kds-settings-form';
import { parseKdsSettings, isKitchenPreorder, kitchenIsOpen, kitchenReleaseAt } from '@/lib/orders/kds-settings';
import { TERMINAL_SOUNDS } from '@/lib/orders/terminal-sounds';
import { kitchenDay, kitchenDeadline, kitchenOverdue } from '@/lib/orders/kitchen-clock';
import type { TerminalLocation, TerminalOrder, TerminalQuery, TerminalView } from '@/lib/orders/terminal-types';
import { TerminalBoard } from './terminal-board';
import { TerminalDetail } from './terminal-detail';
import { TerminalHistory } from './terminal-history';
import { TerminalPreorders } from './terminal-preorders';
import { TerminalReprint } from './terminal-reprint';
import { useTerminalFeed } from './use-terminal-feed';

const tabs: { value: TerminalView; label: string }[] = [{ value: 'board', label: 'Ordrer' }, { value: 'preorders', label: 'Forudbestillinger' }, { value: 'history', label: 'Historik' }];
export type TerminalClientProps = {
  kitchenMode?: boolean;
  fixedScope?: { brandId: string; locationId: string };
  apiBase?: string;
  actionApiBase?: string;
  initialLocations?: TerminalLocation[];
  loginHref?: string;
  logoutControl?: ReactNode;
  onAutomaticChange?: (active: boolean) => void;
  onLogout?: () => void;
  onAccessDenied?: () => void;
};
export function TerminalClient({ kitchenMode = false, fixedScope, apiBase = '/api/merchant/orders', actionApiBase = apiBase, initialLocations, loginHref = '/login', logoutControl, onAutomaticChange, onLogout, onAccessDenied }: TerminalClientProps = {}) {
  const [now, setNow] = useState(Date.now());
  const [chosenDate, setChosenDate] = useState('');
  const [automaticDay, setAutomaticDay] = useState(() => kitchenDay(Date.now()));
  const [automatic, setAutomatic] = useState(false), [sleeping, setSleeping] = useState(false);
  const [preorderNotice, setPreorderNotice] = useState<string[]>([]);
  useEffect(() => { try { setAutomatic(localStorage.getItem('orderfly.kds.automatic') !== 'false'); } catch {} }, []);
  const live = !kitchenMode || automatic && !sleeping;
  useEffect(() => { onAutomaticChange?.(live); }, [live, onAutomaticChange]);
  const [immersive, setImmersive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'sound' | 'orders'>('sound');
  const offset = useRef(0), alarmed = useRef(new Map<string, number>());
  const day = chosenDate || automaticDay;
  useEffect(() => { if (live) setAutomaticDay(kitchenDay(now)); }, [live, now]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now() + offset.current), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!immersive) return; const overflow = document.body.style.overflow, overscroll = document.body.style.overscrollBehavior; document.body.style.overflow = 'hidden'; document.body.style.overscrollBehavior = 'none'; return () => { document.body.style.overflow = overflow; document.body.style.overscrollBehavior = overscroll; }; }, [immersive]);
  const [view, setView] = useState<TerminalView>('board');
  const [scope, setScope] = useState<{ brandId?: string; locationId?: string }>(fixedScope ?? (initialLocations?.[0] ? { brandId: initialLocations[0].brandId, locationId: initialLocations[0].locationId } : {}));
  const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '' });
  const [selected, setSelected] = useState<TerminalOrder | null>(null);
  const [screenMessage, setScreenMessage] = useState('');
  const scopeResolved = !!scope.brandId && !!scope.locationId;
  const query: TerminalQuery = { ...scope, view, ...(view === 'history' ? filters : {}) };
  const boardFeed = useTerminalFeed({ ...scope, view: 'board', ...(kitchenMode ? { serviceDate: day, includePreorders: '1' as const } : {}) }, true, apiBase, true, kitchenMode && (apiBase === '/api/kds/orders' || apiBase === '/api/terminal/orders'), live);
  // The server may choose a default only during initial discovery. Pin that
  // restaurant for every subsequent read so revoked access fails closed rather
  // than silently changing the restaurant behind a cached history view.
  useEffect(() => {
    const initial = boardFeed.data;
    if (!scopeResolved && initial?.selectedBrandId && initial.selectedLocationId) {
      setScope(current => current.brandId && current.locationId ? current : {
        brandId: initial.selectedBrandId!, locationId: initial.selectedLocationId!,
      });
    }
  }, [scopeResolved, boardFeed.data?.selectedBrandId, boardFeed.data?.selectedLocationId]);
  const otherFeed = useTerminalFeed(query, (view === 'history' || !kitchenMode && view === 'preorders') && scopeResolved, apiBase, false, false, live);
  useEffect(() => { if ((view === 'history' || !kitchenMode && view === 'preorders') && boardFeed.changeRevision > 0) otherFeed.refresh(); }, [boardFeed.changeRevision, view, otherFeed.refresh]);
  const feed = view === 'board' || kitchenMode && view === 'preorders' ? boardFeed : otherFeed;
  const settingsKey = JSON.stringify(boardFeed.data?.kitchenSettings ?? {});
  const settings = useMemo(() => parseKdsSettings(JSON.parse(settingsKey)), [settingsKey]);
  const overdueMinutes = settings.overdueMinutes;
  const allKitchenOrders = boardFeed.data?.orders ?? [];
  const preorders = allKitchenOrders.filter(row => isKitchenPreorder(row, now, settings));
  const activeKitchenOrders = allKitchenOrders.filter(row => !isKitchenPreorder(row, now, settings) && (kitchenDay(row.fulfillmentAt || row.createdAt || now) === day || !chosenDate && !!row.fulfillmentAt && Date.parse(row.fulfillmentAt) > now));
  useEffect(() => {
    const active = allKitchenOrders.some(row => !isKitchenPreorder(row, now, settings) && ['Received','In Progress','Ready'].includes(row.status));
    const soon = preorders.some(row => (kitchenReleaseAt(row, settings) ?? Infinity) <= now + 60_000);
    setSleeping(kitchenMode && settings.sleepWhenClosed && !!boardFeed.data && !kitchenIsOpen(boardFeed.data.openingHours, now) && !active && !soon);
  }, [kitchenMode, settings, now, boardFeed.data]);
  useEffect(() => { if (kitchenMode && boardFeed.newPreorders.length) setPreorderNotice(boardFeed.newPreorders); }, [kitchenMode, boardFeed.newPreorders]);
  const latestDenial = Math.max(boardFeed.deniedRevision, otherFeed.deniedRevision);
  const authorizationPending = boardFeed.authorizedRevision <= latestDenial || feed.authorizedRevision <= latestDenial;
  const denialMessage = boardFeed.deniedRevision >= otherFeed.deniedRevision ? boardFeed.denialMessage : otherFeed.denialMessage;
  const connectionError = authorizationPending && latestDenial > 0 ? denialMessage : feed.error || boardFeed.error;
  // A rejection invalidates selection as well as visibility. Restoring access
  // must not reopen a customer detail the operator selected before rejection.
  useEffect(() => { if (latestDenial > 0) { setSelected(null); setPreorderNotice([]); onAccessDenied?.(); } }, [latestDenial, onAccessDenied]);
  useEffect(() => {
    if (view !== 'board' && latestDenial > 0 && boardFeed.authorizedRevision > latestDenial && otherFeed.authorizedRevision <= latestDenial) {
      otherFeed.refresh();
    }
  }, [view, latestDenial, boardFeed.authorizedRevision, otherFeed.authorizedRevision, otherFeed.refresh]);
  const disconnected = feed.offline || boardFeed.offline;
  const outdated = feed.stale || boardFeed.stale;
  const refresh = () => { if (kitchenMode && !chosenDate && day !== kitchenDay(now)) setAutomaticDay(kitchenDay(now)); else boardFeed.refresh(); if (view === 'history' || !kitchenMode && view === 'preorders') otherFeed.refresh(); };
  const data = authorizationPending ? null : feed.data;
  const order = selected && data?.orders.find(row => row.id === selected.id);
  const locations = data?.locations ?? initialLocations ?? [];
  const selectedScope = scope.brandId && scope.locationId ? `${scope.brandId}/${scope.locationId}` : '';
  const pinnedLocation = initialLocations?.length === 1 ? initialLocations[0] : undefined;
  const status = kitchenMode && !automatic ? 'Manuel opdatering' : sleeping ? 'Nattilstand' : disconnected ? 'Offline' : outdated || connectionError ? 'Forbindelsen skal kontrolleres' : feed.reconnecting || boardFeed.reconnecting ? 'Genopretter forbindelse…' : feed.loading ? 'Opdaterer…' : 'Forbundet';
  useEffect(() => {
    if (boardFeed.data?.serverTime) { const server = Date.parse(boardFeed.data.serverTime); if (Number.isFinite(server)) offset.current = server - Date.now(); }
  }, [boardFeed.data?.serverTime]);
  useEffect(() => {
    if (!kitchenMode || sleeping || authorizationPending || !boardFeed.freshForAlerts || !boardFeed.sound || boardFeed.volume === 0 || boardFeed.soundError) return;
    const overdue = (boardFeed.data?.orders ?? []).filter(row => !isKitchenPreorder(row, now, settings) && kitchenOverdue(row, now, overdueMinutes));
    const keys = new Set(overdue.map(row => `${row.brandId}/${row.locationId}/${row.id}/${kitchenDeadline(row)}`));
    for (const key of alarmed.current.keys()) if (!keys.has(key)) alarmed.current.delete(key);
    if ([...keys].some(key => now - (alarmed.current.get(key) ?? 0) >= 60_000)) {
      boardFeed.alertSound(); for (const key of keys) alarmed.current.set(key, now);
    }
  }, [kitchenMode, now, overdueMinutes, authorizationPending, boardFeed.data, boardFeed.freshForAlerts, boardFeed.sound, boardFeed.volume, boardFeed.soundError, boardFeed.alertSound]);
  const renderKitchenOrder = (row: TerminalOrder) => <TerminalDetail inline refreshRevision={feed.authorizedRevision} key={row.id} order={row} now={now} warningMinutes={settings.warningMinutes} overdueMinutes={settings.overdueMinutes} readyTimeEndpoint={`${actionApiBase}/ready-time`} statusEndpoint={`${actionApiBase}/status`} paymentEndpoint={fixedScope ? `${apiBase}/payment` : undefined} canEdit={(data?.canEdit ?? false) && !isKitchenPreorder(row, now, settings)} disabled={disconnected || outdated || !!connectionError} onClose={() => setSelected(null)} onChanged={refresh} reprint={data?.canEdit && !isKitchenPreorder(row, now, settings) ? <LazyKitchenReprint onAccessDenied={onAccessDenied} apiEndpoint={`${actionApiBase}/reprint`} orderId={row.id} brandId={row.brandId} locationId={row.locationId} /> : undefined} />;
  const choose = (row: TerminalOrder) => { boardFeed.clearNewOrders(); setSelected(row); };
  async function fullscreen() {
    setImmersive(true);
    try {
      if (document.fullscreenElement) return;
      // Radix dialogs portal into body; its ancestor must be inside fullscreen.
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setScreenMessage('På iPad kan du føje siden til hjemmeskærmen via Safari → Del.');
    } catch { setScreenMessage('Fuld skærm er ikke tilgængelig her. På iPad kan du bruge Føj til hjemmeskærm i Safari.'); }
  }
  return <div data-kds-fullscreen={immersive} className={immersive ? `fixed inset-0 ${kitchenMode ? 'z-[100]' : 'z-40'} space-y-5 overflow-y-auto overscroll-none bg-white p-4 text-slate-900` : 'min-h-[80dvh] space-y-5 bg-white p-1 text-slate-900 sm:p-3'} style={immersive ? { touchAction: 'pan-y', overscrollBehavior: 'none' } : undefined}>
    {immersive && <button aria-label="Luk fuld skærm" className="sticky top-0 z-20 ml-auto block min-h-14 min-w-14 rounded-xl border-2 bg-white text-3xl font-bold" onClick={() => { setImmersive(false); if (document.fullscreenElement) void document.exitFullscreen(); }}>×</button>}
    <header className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3">{kitchenMode && <button aria-label="Menu" aria-expanded={menuOpen} aria-controls="kds-settings" className="min-h-12 min-w-12 rounded-xl border text-2xl" onClick={() => setMenuOpen(value => !value)}>☰</button>}<div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Orderfly · Ordreterminal</p><h1 className="mt-1 text-2xl font-bold">Dagens ordrer</h1>{!fixedScope && !initialLocations && <a className="mt-1 inline-block py-2 text-sm text-slate-600 underline" href="/merchant">Tilbage til oversigt</a>}</div></div><div className="flex flex-wrap items-center gap-2">{!kitchenMode && <button className="min-h-12 rounded-xl border px-4 font-medium" aria-pressed={boardFeed.sound} onClick={() => void boardFeed.toggleSound()}>{boardFeed.sound ? 'Slå lyd fra' : 'Slå lyd til'}</button>}<button className="min-h-12 rounded-xl border px-4 font-medium" onClick={() => void fullscreen()}>Fuld skærm</button><button className="min-h-12 rounded-xl bg-slate-900 px-5 font-semibold text-white disabled:opacity-50" onClick={refresh} disabled={feed.loading}>Opdater</button>{onLogout && <button className="min-h-12 rounded-xl border px-4 font-medium" onClick={onLogout}>Log ud</button>}{logoutControl}</div></header>
    {kitchenMode ? menuOpen && <section id="kds-settings" aria-label="Indstillinger" className="rounded-xl border bg-slate-50 p-4">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Indstillinger</h2><button aria-label="Luk menu" className="min-h-12 min-w-12 rounded-lg border text-2xl" onClick={() => setMenuOpen(false)}>×</button></div>
      <nav aria-label="Indstillinger" className="my-3 flex flex-wrap gap-2">{([{id:'sound',label:'Lydindstillinger'}, {id:'orders',label:'Ordreindstillinger'}] as const).map(tab => <button key={tab.id} aria-pressed={settingsTab === tab.id} className={`min-h-12 rounded-xl border px-4 font-semibold ${settingsTab === tab.id ? 'bg-slate-900 text-white' : 'bg-white'}`} onClick={() => setSettingsTab(tab.id)}>{tab.label}</button>)}</nav>
      {settingsTab === 'sound' ? (<div className="flex flex-wrap items-center gap-4 pt-2">
        {kitchenMode && <button className="min-h-12 rounded-xl border px-4 font-medium" aria-pressed={boardFeed.sound} onClick={() => void boardFeed.toggleSound()}>{boardFeed.sound ? 'Slå lyd fra' : 'Slå lyd til'}</button>}
        <label className="flex items-center gap-3">Lyd<select aria-label="Vælg lyd" className="min-h-12 rounded-lg border bg-white p-3" value={boardFeed.soundId} onChange={event => boardFeed.setSoundId(event.target.value)}>{Object.entries(TERMINAL_SOUNDS).map(([id, value]) => <option key={id} value={id}>{value.name}</option>)}</select></label>
        <button className="min-h-12 rounded-xl border bg-white px-4 font-medium" onClick={() => void boardFeed.testSound()}>Test lyd</button>

        <label className="flex items-center gap-3">Lydstyrke
          <input aria-label="Lydstyrke" type="range" min="0" max="100" step="5" value={boardFeed.volume} onChange={event => boardFeed.setVolume(Number(event.target.value))} />
          <output>{boardFeed.volume}%</output>
        </label>
        <p className="text-sm text-slate-600">Melodi på 3,6 sekunder. Enhedens egen lydstyrke gælder også.</p>
        {boardFeed.soundError && <p role="status" className="w-full text-sm text-amber-900">{boardFeed.soundError}</p>}
      </div>) : <div className="space-y-5 py-2"><label className="flex items-center gap-3"><input type="checkbox" aria-label="Automatisk opdatering" checked={automatic} onChange={event => { setAutomatic(event.target.checked); try { localStorage.setItem('orderfly.kds.automatic', String(event.target.checked)); } catch {} }} />Automatisk opdatering på denne enhed</label><p className="text-sm">Slå fra for kun at hente data ved Opdater eller egne ordrehandlinger. Nye ordrer og alarmer kræver friske data.</p><KdsSettingsForm settings={settings} revision={boardFeed.data?.kitchenSettingsRevision ?? 0} brandId={scope.brandId} locationId={scope.locationId} endpoint={`${apiBase}/settings`} canEdit={!!boardFeed.data?.canEdit} onSaved={refresh} /></div>}
    </section> : (<details className="rounded-xl border bg-slate-50 p-3">
      <summary className="min-h-10 cursor-pointer font-semibold">Lydindstillinger · {boardFeed.sound ? 'Til' : 'Fra'} · {boardFeed.volume}%</summary>
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <label className="flex items-center gap-3">Lyd<select aria-label="Vælg lyd" className="min-h-12 rounded-lg border bg-white p-3" value={boardFeed.soundId} onChange={event => boardFeed.setSoundId(event.target.value)}>{Object.entries(TERMINAL_SOUNDS).map(([id, value]) => <option key={id} value={id}>{value.name}</option>)}</select></label>
        <button className="min-h-12 rounded-xl border bg-white px-4 font-medium" onClick={() => void boardFeed.testSound()}>Test lyd</button>
        <label className="flex items-center gap-3">Lydstyrke
          <input aria-label="Lydstyrke" type="range" min="0" max="100" step="5" value={boardFeed.volume} onChange={event => boardFeed.setVolume(Number(event.target.value))} />
          <output>{boardFeed.volume}%</output>
        </label>
        <p className="text-sm text-slate-600">Melodi på 3,6 sekunder. Enhedens egen lydstyrke gælder også.</p>
      </div>
    </details>)}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3"><label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">Restaurant{pinnedLocation ? <span className="text-base">{pinnedLocation.brandName} · {pinnedLocation.locationName}</span> : fixedScope ? <span className="text-base">{data ? `${data.locations.find(row => row.brandId === fixedScope.brandId && row.locationId === fixedScope.locationId)?.brandName || data.orders[0]?.brandName || 'Restaurant'} · ${data.locations.find(row => row.locationId === fixedScope.locationId)?.locationName || data.orders[0]?.locationName || 'Lokation'}` : 'Indlæser…'}</span> : <select aria-label="Restaurant" className="min-h-12 max-w-full rounded-lg border bg-white px-3 text-base" value={selectedScope} disabled={!locations.length} onChange={event => { const location = locations.find(row => `${row.brandId}/${row.locationId}` === event.target.value); if (location) { setSelected(null); setPreorderNotice([]); setScope({ brandId: location.brandId, locationId: location.locationId }); } }}>
      {!locations.length && <option value="">Henter restauranter…</option>}{locations.map(location => <option key={`${location.brandId}/${location.locationId}`} value={`${location.brandId}/${location.locationId}`}>{location.brandName} · {location.locationName}</option>)}</select>}</label><div className="text-sm"><span className={`inline-block mr-2 h-2.5 w-2.5 rounded-full ${disconnected || outdated || connectionError ? 'bg-amber-500' : 'bg-emerald-600'}`} aria-hidden="true" /><span role="status">{status}</span>{feed.lastUpdated && <span className="ml-2 text-slate-500">Senest {new Date(feed.lastUpdated).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}</div></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
      {kitchenMode && view === 'board' && <div className="flex flex-wrap items-center gap-3"><label className="font-semibold">Ordredato<input aria-label="Ordredato" type="date" value={day} onChange={event => setChosenDate(event.target.value)} className="ml-3 min-h-12 rounded-lg border p-2 text-lg" /></label><button className="min-h-12 rounded-lg border px-4 font-semibold" onClick={() => setChosenDate('')}>I dag</button></div>}
    <nav aria-label="Ordrevisning" className="ml-auto flex flex-wrap justify-end gap-2">{tabs.map(tab => <button key={tab.value} aria-current={view === tab.value ? 'page' : undefined} className={`min-h-12 rounded-xl px-5 font-semibold ${view === tab.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => { setSelected(null); setView(tab.value); }}>{tab.label}{' '}{kitchenMode && tab.value !== 'history' && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-sm text-slate-900">{tab.value === 'preorders' ? preorders.filter(row => row.status === 'Received').length : activeKitchenOrders.filter(row => row.status === 'Received').length}</span>}</button>)}</nav>
    </div>
    {boardFeed.newOrders > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 font-semibold text-blue-900"><span>{boardFeed.newOrders === 1 ? 'Der er kommet en ny ordre' : `Der er kommet ${boardFeed.newOrders} nye ordrer`}</span><button className="min-h-11 rounded-lg border border-blue-200 px-4" onClick={() => { setView('board'); boardFeed.clearNewOrders(); }}>Vis nye ordrer</button></div>}
    {((!kitchenMode && boardFeed.soundError) || screenMessage) && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">{(!kitchenMode && boardFeed.soundError) || screenMessage}</p>}
    {connectionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4"><p>{connectionError}</p><p className="mt-1 text-sm">Viste ordrer kan være forældede. Ingen ændring er bekræftet af denne fejl.</p><button className="mt-2 min-h-11 rounded-lg border bg-white px-4" disabled={feed.loading} onClick={refresh}>Prøv igen</button>{connectionError.includes('Log ind') && <a href={loginHref} className="ml-4 underline">Log ind igen</a>}</div>}

    {kitchenMode && !authorizationPending && preorderNotice.length > 0 && <section role="alertdialog" aria-label="Forudbestilling modtaget" className="fixed inset-x-4 top-20 z-[120] mx-auto max-w-lg space-y-4 rounded-2xl border-4 border-blue-600 bg-white p-6 shadow-2xl"><h2 className="text-2xl font-bold">Forudbestilling modtaget</h2><p>{preorderNotice.join(', ')}</p><button className="min-h-14 rounded-xl bg-slate-900 px-6 text-lg font-semibold text-white" onClick={() => { setView('preorders'); setPreorderNotice([]); boardFeed.clearNewOrders(); }}>Vis forudbestillinger</button><button className="ml-3 min-h-14 rounded-xl border px-6" onClick={() => setPreorderNotice([])}>Luk</button></section>}
    {view === 'board' && <TerminalBoard renderOrder={kitchenMode ? renderKitchenOrder : undefined} orders={kitchenMode ? (data ? activeKitchenOrders : []) : data?.orders ?? []} loading={feed.loading} onSelectOrder={choose} hasMore={data?.hasMore} onLoadMore={feed.loadMore} />}
    {view === 'history' && <TerminalHistory error={connectionError || undefined} onRetry={refresh} orders={data?.orders ?? []} filters={filters} onFiltersChange={setFilters} loading={feed.loading} onSelectOrder={choose} onReprint={data?.canEdit ? choose : undefined} hasMore={data?.hasMore} onLoadMore={feed.loadMore} />}
    {view === 'preorders' && <TerminalPreorders error={connectionError || undefined} onRetry={refresh} orders={kitchenMode ? (data ? preorders : []) : data?.orders ?? []} loading={feed.loading} onSelectOrder={choose} onReprint={!kitchenMode && data?.canEdit ? choose : undefined} hasMore={data?.hasMore} onLoadMore={feed.loadMore} serverTime={data?.serverTime} />}
    {data && order && kitchenMode && <div><button className="min-h-12 rounded-lg border px-4" onClick={() => setSelected(null)}>Luk ordrevisning</button>{renderKitchenOrder(order)}</div>}
    {data && order && !kitchenMode && <TerminalDetail refreshRevision={feed.authorizedRevision} key={order.id} order={order} statusEndpoint={`${actionApiBase}/status`} paymentEndpoint={fixedScope ? `${apiBase}/payment` : undefined} canEdit={data?.canEdit ?? false} disabled={disconnected || outdated || !!connectionError} onClose={() => setSelected(null)} onChanged={refresh} reprint={data?.canEdit ? <TerminalReprint onAccessDenied={onAccessDenied} apiEndpoint={`${actionApiBase}/reprint`} orderId={order.id} brandId={order.brandId} locationId={order.locationId} /> : undefined} />}
    {!kitchenMode && <p className="text-xs text-slate-500">Hold siden åben for nye ordrer. Lyden skal aktiveres med et tryk og kan sættes på pause, når iPad låses.</p>}
  </div>;
}

function LazyKitchenReprint(props: Parameters<typeof TerminalReprint>[0]) {
  const [opened, setOpened] = useState(false);
  return <details className="rounded-lg border p-3" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}><summary className="min-h-12 cursor-pointer font-semibold">Genprint</summary>{opened && <TerminalReprint {...props} />}</details>;
}
