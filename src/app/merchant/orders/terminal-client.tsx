'use client';
import { useEffect, useRef, useState } from 'react';
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
  onLogout?: () => void;
  onAccessDenied?: () => void;
};
export function TerminalClient({ kitchenMode = false, fixedScope, apiBase = '/api/merchant/orders', actionApiBase = apiBase, initialLocations, loginHref = '/login', onLogout, onAccessDenied }: TerminalClientProps = {}) {
  const [now, setNow] = useState(Date.now());
  const [chosenDate, setChosenDate] = useState('');
  const [overdueMinutes, setOverdueMinutes] = useState(5);
  const [immersive, setImmersive] = useState(false);
  const offset = useRef(0), alarmed = useRef(new Map<string, number>());
  const day = chosenDate || kitchenDay(now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now() + offset.current), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { try { const saved = localStorage.getItem('orderfly.kds.overdueMinutes'); if (saved !== null && Number.isFinite(Number(saved))) setOverdueMinutes(Math.max(0, Math.min(120, Number(saved)))); } catch {} }, []);
  useEffect(() => { if (!immersive) return; const overflow = document.body.style.overflow, overscroll = document.body.style.overscrollBehavior; document.body.style.overflow = 'hidden'; document.body.style.overscrollBehavior = 'none'; return () => { document.body.style.overflow = overflow; document.body.style.overscrollBehavior = overscroll; }; }, [immersive]);
  const [view, setView] = useState<TerminalView>('board');
  const [scope, setScope] = useState<{ brandId?: string; locationId?: string }>(fixedScope ?? (initialLocations?.[0] ? { brandId: initialLocations[0].brandId, locationId: initialLocations[0].locationId } : {}));
  const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '' });
  const [selected, setSelected] = useState<TerminalOrder | null>(null);
  const [screenMessage, setScreenMessage] = useState('');
  const scopeResolved = !!scope.brandId && !!scope.locationId;
  const query: TerminalQuery = { ...scope, view, ...(view === 'history' ? filters : {}) };
  const boardFeed = useTerminalFeed({ ...scope, view: 'board', ...(kitchenMode ? { serviceDate: day } : {}) }, true, apiBase);
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
  const otherFeed = useTerminalFeed(query, view !== 'board' && scopeResolved, apiBase, false);
  const feed = view === 'board' ? boardFeed : otherFeed;
  const latestDenial = Math.max(boardFeed.deniedRevision, otherFeed.deniedRevision);
  const authorizationPending = boardFeed.authorizedRevision <= latestDenial || feed.authorizedRevision <= latestDenial;
  const denialMessage = boardFeed.deniedRevision >= otherFeed.deniedRevision ? boardFeed.denialMessage : otherFeed.denialMessage;
  const connectionError = authorizationPending && latestDenial > 0 ? denialMessage : feed.error || boardFeed.error;
  // A rejection invalidates selection as well as visibility. Restoring access
  // must not reopen a customer detail the operator selected before rejection.
  useEffect(() => { if (latestDenial > 0) { setSelected(null); onAccessDenied?.(); } }, [latestDenial, onAccessDenied]);
  useEffect(() => {
    if (view !== 'board' && latestDenial > 0 && boardFeed.authorizedRevision > latestDenial && otherFeed.authorizedRevision <= latestDenial) {
      otherFeed.refresh();
    }
  }, [view, latestDenial, boardFeed.authorizedRevision, otherFeed.authorizedRevision, otherFeed.refresh]);
  const disconnected = feed.offline || boardFeed.offline;
  const outdated = feed.stale || boardFeed.stale;
  const refresh = () => { feed.refresh(); if (view !== 'board') boardFeed.refresh(); };
  const data = authorizationPending ? null : feed.data;
  const order = selected && data?.orders.find(row => row.id === selected.id);
  const locations = data?.locations ?? initialLocations ?? [];
  const selectedScope = scope.brandId && scope.locationId ? `${scope.brandId}/${scope.locationId}` : '';
  const pinnedLocation = initialLocations?.length === 1 ? initialLocations[0] : undefined;
  const status = disconnected ? 'Offline' : outdated || connectionError ? 'Forbindelsen skal kontrolleres' : feed.reconnecting || boardFeed.reconnecting ? 'Genopretter forbindelse…' : feed.loading ? 'Opdaterer…' : 'Forbundet';
  useEffect(() => {
    if (boardFeed.data?.serverTime) { const server = Date.parse(boardFeed.data.serverTime); if (Number.isFinite(server)) offset.current = server - Date.now(); }
  }, [boardFeed.data?.serverTime]);
  useEffect(() => {
    if (!kitchenMode || authorizationPending || boardFeed.stale || !boardFeed.sound || boardFeed.volume === 0 || boardFeed.soundError) return;
    const overdue = (boardFeed.data?.orders ?? []).filter(row => kitchenOverdue(row, now, overdueMinutes));
    const keys = new Set(overdue.map(row => `${row.brandId}/${row.locationId}/${row.id}/${kitchenDeadline(row)}`));
    for (const key of alarmed.current.keys()) if (!keys.has(key)) alarmed.current.delete(key);
    if ([...keys].some(key => now - (alarmed.current.get(key) ?? 0) >= 60_000)) {
      boardFeed.alertSound(); for (const key of keys) alarmed.current.set(key, now);
    }
  }, [kitchenMode, now, overdueMinutes, authorizationPending, boardFeed.data, boardFeed.stale, boardFeed.sound, boardFeed.volume, boardFeed.soundError, boardFeed.alertSound]);
  const renderKitchenOrder = (row: TerminalOrder) => <TerminalDetail inline key={row.id} order={row} now={now} readyTimeEndpoint={`${actionApiBase}/ready-time`} statusEndpoint={`${actionApiBase}/status`} paymentEndpoint={fixedScope ? `${apiBase}/payment` : undefined} canEdit={data?.canEdit ?? false} disabled={disconnected || outdated || !!connectionError} onClose={() => setSelected(null)} onChanged={refresh} reprint={data?.canEdit ? <LazyKitchenReprint onAccessDenied={onAccessDenied} apiEndpoint={`${actionApiBase}/reprint`} orderId={row.id} brandId={row.brandId} locationId={row.locationId} /> : undefined} />;
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
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Orderfly · Ordreterminal</p><h1 className="mt-1 text-2xl font-bold">Dagens ordrer</h1>{!fixedScope && !initialLocations && <a className="mt-1 inline-block py-2 text-sm text-slate-600 underline" href="/merchant">Tilbage til oversigt</a>}</div><div className="flex flex-wrap items-center gap-2">{onLogout && <button className="min-h-12 rounded-xl border px-4 font-medium" onClick={onLogout}>Log ud</button>}{!kitchenMode && <button className="min-h-12 rounded-xl border px-4 font-medium" aria-pressed={boardFeed.sound} onClick={() => void boardFeed.toggleSound()}>{boardFeed.sound ? 'Slå lyd fra' : 'Slå lyd til'}</button>}<button className="min-h-12 rounded-xl border px-4 font-medium" onClick={() => void fullscreen()}>Fuld skærm</button><button className="min-h-12 rounded-xl bg-slate-900 px-5 font-semibold text-white disabled:opacity-50" onClick={refresh} disabled={feed.loading}>Opdater</button></div></header>
    <details className="rounded-xl border bg-slate-50 p-3">
      <summary className="min-h-10 cursor-pointer font-semibold">{kitchenMode ? 'Menu · Lyd og køkkenindstillinger' : 'Lydindstillinger'} · {boardFeed.sound ? 'Til' : 'Fra'} · {boardFeed.volume}%</summary>
      <div className="flex flex-wrap items-center gap-4 pt-2">
        {kitchenMode && <button className="min-h-12 rounded-xl border px-4 font-medium" aria-pressed={boardFeed.sound} onClick={() => void boardFeed.toggleSound()}>{boardFeed.sound ? 'Slå lyd fra' : 'Slå lyd til'}</button>}
        <label className="flex items-center gap-3">Lyd<select aria-label="Vælg lyd" className="min-h-12 rounded-lg border bg-white p-3" value={boardFeed.soundId} onChange={event => boardFeed.setSoundId(event.target.value)}>{Object.entries(TERMINAL_SOUNDS).map(([id, value]) => <option key={id} value={id}>{value.name}</option>)}</select></label>
        <button className="min-h-12 rounded-xl border bg-white px-4 font-medium" onClick={() => void boardFeed.testSound()}>Test lyd</button>
        {kitchenMode && <label className="flex flex-wrap items-center gap-3">Alarm efter overskridelse (minutter)<input aria-label="Alarm efter minutter" type="number" min="0" max="120" className="min-h-12 w-24 rounded-lg border p-3" value={overdueMinutes} onChange={event => { const value = Math.max(0, Math.min(120, Math.round(Number(event.target.value)))); setOverdueMinutes(value); try { localStorage.setItem('orderfly.kds.overdueMinutes', String(value)); } catch {} }} /><span className="text-sm">Gentages hvert minut, indtil ordren er klar eller tiden ændres.</span></label>}
        <label className="flex items-center gap-3">Lydstyrke
          <input aria-label="Lydstyrke" type="range" min="0" max="100" step="5" value={boardFeed.volume} onChange={event => boardFeed.setVolume(Number(event.target.value))} />
          <output>{boardFeed.volume}%</output>
        </label>
        <p className="text-sm text-slate-600">Melodi på 3,6 sekunder. Enhedens egen lydstyrke gælder også.</p>
      </div>
    </details>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3"><label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">Restaurant{pinnedLocation ? <span className="text-base">{pinnedLocation.brandName} · {pinnedLocation.locationName}</span> : fixedScope ? <span className="text-base">{data ? `${data.locations.find(row => row.brandId === fixedScope.brandId && row.locationId === fixedScope.locationId)?.brandName || data.orders[0]?.brandName || 'Restaurant'} · ${data.locations.find(row => row.locationId === fixedScope.locationId)?.locationName || data.orders[0]?.locationName || 'Lokation'}` : 'Indlæser…'}</span> : <select aria-label="Restaurant" className="min-h-12 max-w-full rounded-lg border bg-white px-3 text-base" value={selectedScope} disabled={!locations.length} onChange={event => { const location = locations.find(row => `${row.brandId}/${row.locationId}` === event.target.value); if (location) { setSelected(null); setScope({ brandId: location.brandId, locationId: location.locationId }); } }}>
      {!locations.length && <option value="">Henter restauranter…</option>}{locations.map(location => <option key={`${location.brandId}/${location.locationId}`} value={`${location.brandId}/${location.locationId}`}>{location.brandName} · {location.locationName}</option>)}</select>}</label><div className="text-sm"><span className={`inline-block mr-2 h-2.5 w-2.5 rounded-full ${disconnected || outdated || connectionError ? 'bg-amber-500' : 'bg-emerald-600'}`} aria-hidden="true" /><span role="status">{status}</span>{feed.lastUpdated && <span className="ml-2 text-slate-500">Senest {new Date(feed.lastUpdated).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}</div></div>
    <nav aria-label="Ordrevisning" className="flex flex-wrap gap-2 border-b pb-3">{tabs.map(tab => <button key={tab.value} aria-current={view === tab.value ? 'page' : undefined} className={`min-h-12 rounded-xl px-5 font-semibold ${view === tab.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => { setSelected(null); setView(tab.value); }}>{tab.label}</button>)}</nav>
    {boardFeed.newOrders > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 font-semibold text-blue-900"><span>{boardFeed.newOrders === 1 ? 'Der er kommet en ny ordre' : `Der er kommet ${boardFeed.newOrders} nye ordrer`}</span><button className="min-h-11 rounded-lg border border-blue-200 px-4" onClick={() => { setView('board'); boardFeed.clearNewOrders(); }}>Vis nye ordrer</button></div>}
    {(boardFeed.soundError || screenMessage) && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">{boardFeed.soundError || screenMessage}</p>}
    {connectionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4"><p>{connectionError}</p><p className="mt-1 text-sm">Viste ordrer kan være forældede. Ingen ændring er bekræftet af denne fejl.</p><button className="mt-2 min-h-11 rounded-lg border bg-white px-4" disabled={feed.loading} onClick={refresh}>Prøv igen</button>{connectionError.includes('Log ind') && <a href={loginHref} className="ml-4 underline">Log ind igen</a>}</div>}
    {kitchenMode && view === 'board' && <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3"><label className="font-semibold">Ordredato<input aria-label="Ordredato" type="date" value={day} onChange={event => setChosenDate(event.target.value)} className="ml-3 min-h-12 rounded-lg border p-2 text-lg" /></label><button className="min-h-12 rounded-lg border px-4 font-semibold" onClick={() => setChosenDate('')}>I dag</button><span className="text-sm">Afhentnings-/leveringsdato · dansk tid</span></div>}
    {view === 'board' && <TerminalBoard renderOrder={kitchenMode ? renderKitchenOrder : undefined} orders={data?.orders ?? []} loading={feed.loading} onSelectOrder={choose} hasMore={data?.hasMore} onLoadMore={feed.loadMore} />}
    {view === 'history' && <TerminalHistory error={connectionError || undefined} onRetry={refresh} orders={data?.orders ?? []} filters={filters} onFiltersChange={setFilters} loading={feed.loading} onSelectOrder={choose} onReprint={data?.canEdit ? choose : undefined} hasMore={data?.hasMore} onLoadMore={feed.loadMore} />}
    {view === 'preorders' && <TerminalPreorders error={connectionError || undefined} onRetry={refresh} orders={data?.orders ?? []} loading={feed.loading} onSelectOrder={choose} onReprint={data?.canEdit ? choose : undefined} hasMore={data?.hasMore} onLoadMore={feed.loadMore} serverTime={data?.serverTime} />}
    {data && order && kitchenMode && <div><button className="min-h-12 rounded-lg border px-4" onClick={() => setSelected(null)}>Luk ordrevisning</button>{renderKitchenOrder(order)}</div>}
    {data && order && !kitchenMode && <TerminalDetail key={order.id} order={order} statusEndpoint={`${actionApiBase}/status`} paymentEndpoint={fixedScope ? `${apiBase}/payment` : undefined} canEdit={data?.canEdit ?? false} disabled={disconnected || outdated || !!connectionError} onClose={() => setSelected(null)} onChanged={refresh} reprint={data?.canEdit ? <TerminalReprint onAccessDenied={onAccessDenied} apiEndpoint={`${actionApiBase}/reprint`} orderId={order.id} brandId={order.brandId} locationId={order.locationId} /> : undefined} />}
    <p className="text-xs text-slate-500">Hold siden åben for nye ordrer. Lyden skal aktiveres med et tryk og kan sættes på pause, når iPad låses.</p>
  </div>;
}

function LazyKitchenReprint(props: Parameters<typeof TerminalReprint>[0]) {
  const [opened, setOpened] = useState(false);
  return <details className="rounded-lg border p-3" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}><summary className="min-h-12 cursor-pointer font-semibold">Genprint</summary>{opened && <TerminalReprint {...props} />}</details>;
}
