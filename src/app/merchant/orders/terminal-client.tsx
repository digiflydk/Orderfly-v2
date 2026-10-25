'use client';
import { useEffect, useState } from 'react';
import type { TerminalOrder, TerminalQuery, TerminalView } from '@/lib/orders/terminal-types';
import { TerminalBoard } from './terminal-board';
import { TerminalDetail } from './terminal-detail';
import { TerminalHistory } from './terminal-history';
import { TerminalPreorders } from './terminal-preorders';
import { TerminalReprint } from './terminal-reprint';
import { useTerminalFeed } from './use-terminal-feed';

const tabs: { value: TerminalView; label: string }[] = [{ value: 'board', label: 'Ordrer' }, { value: 'preorders', label: 'Forudbestillinger' }, { value: 'history', label: 'Historik' }];
export function TerminalClient() {
  const [view, setView] = useState<TerminalView>('board');
  const [scope, setScope] = useState<{ brandId?: string; locationId?: string }>({});
  const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '' });
  const [selected, setSelected] = useState<TerminalOrder | null>(null);
  const [screenMessage, setScreenMessage] = useState('');
  const scopeResolved = !!scope.brandId && !!scope.locationId;
  const query: TerminalQuery = { ...scope, view, ...(view === 'history' ? filters : {}) };
  const boardFeed = useTerminalFeed({ ...scope, view: 'board' });
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
  const otherFeed = useTerminalFeed(query, view !== 'board' && scopeResolved);
  const feed = view === 'board' ? boardFeed : otherFeed;
  const latestDenial = Math.max(boardFeed.deniedRevision, otherFeed.deniedRevision);
  const authorizationPending = boardFeed.authorizedRevision <= latestDenial || feed.authorizedRevision <= latestDenial;
  const denialMessage = boardFeed.deniedRevision >= otherFeed.deniedRevision ? boardFeed.denialMessage : otherFeed.denialMessage;
  const connectionError = authorizationPending && latestDenial > 0 ? denialMessage : feed.error || boardFeed.error;
  // A rejection invalidates selection as well as visibility. Restoring access
  // must not reopen a customer detail the operator selected before rejection.
  useEffect(() => { if (latestDenial > 0) setSelected(null); }, [latestDenial]);
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
  const selectedScope = data?.selectedBrandId && data.selectedLocationId ? `${data.selectedBrandId}/${data.selectedLocationId}` : '';
  const status = disconnected ? 'Offline' : outdated || connectionError ? 'Forbindelsen skal kontrolleres' : feed.loading ? 'Opdaterer…' : 'Forbundet';
  const choose = (row: TerminalOrder) => { boardFeed.clearNewOrders(); setSelected(row); };
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      // Radix dialogs portal into body; its ancestor must be inside fullscreen.
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else setScreenMessage('På iPad kan du føje siden til hjemmeskærmen via Safari → Del.');
    } catch { setScreenMessage('Fuld skærm er ikke tilgængelig her. På iPad kan du bruge Føj til hjemmeskærm i Safari.'); }
  }
  return <div className="min-h-[80dvh] space-y-5 bg-white p-1 text-slate-900 sm:p-3">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Orderfly · Ordreterminal</p><h1 className="mt-1 text-2xl font-bold">Dagens ordrer</h1><a className="mt-1 inline-block py-2 text-sm text-slate-600 underline" href="/merchant">Tilbage til oversigt</a></div><div className="flex flex-wrap items-center gap-2"><button className="min-h-12 rounded-xl border px-4 font-medium" aria-pressed={boardFeed.sound} onClick={() => void boardFeed.toggleSound()}>{boardFeed.sound ? (boardFeed.soundError ? 'Aktivér lyd igen' : 'Slå lyd fra') : 'Slå lyd til'}</button><button className="min-h-12 rounded-xl border px-4 font-medium" onClick={() => void fullscreen()}>Fuld skærm</button><button className="min-h-12 rounded-xl bg-slate-900 px-5 font-semibold text-white disabled:opacity-50" onClick={refresh} disabled={feed.loading}>Opdater</button></div></header>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3"><label className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">Restaurant<select aria-label="Restaurant" className="min-h-12 max-w-full rounded-lg border bg-white px-3 text-base" value={selectedScope} disabled={!data?.locations.length} onChange={event => { const location = data?.locations.find(row => `${row.brandId}/${row.locationId}` === event.target.value); if (location) { setSelected(null); setScope({ brandId: location.brandId, locationId: location.locationId }); } }}>
      {!data?.locations.length && <option value="">Henter restauranter…</option>}{data?.locations.map(location => <option key={`${location.brandId}/${location.locationId}`} value={`${location.brandId}/${location.locationId}`}>{location.brandName} · {location.locationName}</option>)}</select></label><div className="text-sm"><span className={`inline-block mr-2 h-2.5 w-2.5 rounded-full ${disconnected || outdated || connectionError ? 'bg-amber-500' : 'bg-emerald-600'}`} aria-hidden="true" /><span role="status">{status}</span>{feed.lastUpdated && <span className="ml-2 text-slate-500">Senest {new Date(feed.lastUpdated).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}</div></div>
    <nav aria-label="Ordrevisning" className="flex flex-wrap gap-2 border-b pb-3">{tabs.map(tab => <button key={tab.value} aria-current={view === tab.value ? 'page' : undefined} className={`min-h-12 rounded-xl px-5 font-semibold ${view === tab.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => { setSelected(null); setView(tab.value); }}>{tab.label}</button>)}</nav>
    {boardFeed.newOrders > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 font-semibold text-blue-900"><span>{boardFeed.newOrders === 1 ? 'Der er kommet en ny ordre' : `Der er kommet ${boardFeed.newOrders} nye ordrer`}</span><button className="min-h-11 rounded-lg border border-blue-200 px-4" onClick={() => { setView('board'); boardFeed.clearNewOrders(); }}>Vis nye ordrer</button></div>}
    {(boardFeed.soundError || screenMessage) && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">{boardFeed.soundError || screenMessage}</p>}
    {connectionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4"><p>{connectionError}</p><p className="mt-1 text-sm">Viste ordrer kan være forældede. Ingen ændring er bekræftet af denne fejl.</p><button className="mt-2 min-h-11 rounded-lg border bg-white px-4" disabled={feed.loading} onClick={refresh}>Prøv igen</button>{connectionError.includes('Log ind') && <a href="/admin-login?next=%2Fmerchant%2Forders" className="ml-4 underline">Log ind igen</a>}</div>}
    {view === 'board' && <TerminalBoard orders={data?.orders ?? []} loading={feed.loading} onSelectOrder={choose} hasMore={data?.hasMore} onLoadMore={feed.loadMore} />}
    {view === 'history' && <TerminalHistory error={connectionError || undefined} onRetry={refresh} orders={data?.orders ?? []} filters={filters} onFiltersChange={setFilters} loading={feed.loading} onSelectOrder={choose} onReprint={data?.canEdit ? choose : undefined} hasMore={data?.hasMore} onLoadMore={feed.loadMore} />}
    {view === 'preorders' && <TerminalPreorders error={connectionError || undefined} onRetry={refresh} orders={data?.orders ?? []} loading={feed.loading} onSelectOrder={choose} onReprint={data?.canEdit ? choose : undefined} hasMore={data?.hasMore} onLoadMore={feed.loadMore} serverTime={data?.serverTime} />}
    {data && order && <TerminalDetail key={order.id} order={order} canEdit={data?.canEdit ?? false} disabled={disconnected || outdated || !!connectionError} onClose={() => setSelected(null)} onChanged={refresh} reprint={data?.canEdit ? <TerminalReprint orderId={order.id} brandId={order.brandId} locationId={order.locationId} /> : undefined} />}
    <p className="text-xs text-slate-500">Hold siden åben for nye ordrer. Lyden skal aktiveres med et tryk og kan sættes på pause, når iPad låses.</p>
  </div>;
}
