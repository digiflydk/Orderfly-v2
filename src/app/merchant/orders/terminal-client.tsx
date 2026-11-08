'use client';
import { useKdsLanguage, restoreKdsLanguage } from './kds-language';
import { ClipboardList, CalendarClock, History, RefreshCw, Maximize, Menu, VolumeX, Store } from 'lucide-react';
import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
import { KdsMenu } from './kds-menu';
import { MobileKdsBoard, MobileKdsBottomNav } from './mobile-kds-board';
import type { MobileKdsStage, MobileReadyLane } from '@/lib/orders/mobile-kds';
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
  const {t, language} = useKdsLanguage();
  useEffect(() => { restoreKdsLanguage(); }, []);
  const [now, setNow] = useState(Date.now());
  const [chosenDate, setChosenDate] = useState('');
  const [automaticDay, setAutomaticDay] = useState(() => kitchenDay(Date.now()));
  const [automatic, setAutomatic] = useState(false), [sleeping, setSleeping] = useState(false);
  const [repeatNewOrders, setRepeatNewOrders] = useState(false);
  const lastNewOrderAlarm = useRef(0);
  useEffect(() => { try { setRepeatNewOrders(localStorage.getItem('orderfly.kds.repeatNewOrders') === 'true'); } catch {} }, []);
  const [preorderNotice, setPreorderNotice] = useState<string[]>([]);
  useEffect(() => { try { setAutomatic(localStorage.getItem('orderfly.kds.automatic') !== 'false'); } catch {} }, []);
  const live = !kitchenMode || automatic && !sleeping;
  useEffect(() => { onAutomaticChange?.(live); }, [live, onAutomaticChange]);
  const [immersive, setImmersive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const offset = useRef(0), alarmed = useRef(new Map<string, number>());
  const day = chosenDate || automaticDay;
  useEffect(() => { if (live) setAutomaticDay(kitchenDay(now)); }, [live, now]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now() + offset.current), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!immersive) return; const overflow = document.body.style.overflow, overscroll = document.body.style.overscrollBehavior; document.body.style.overflow = 'hidden'; document.body.style.overscrollBehavior = 'none'; return () => { document.body.style.overflow = overflow; document.body.style.overscrollBehavior = overscroll; }; }, [immersive]);
  const [view, setView] = useState<TerminalView>('board');
  const [mobileStage, setMobileStage] = useState<MobileKdsStage>('received');
  const [mobileViewport, setMobileViewport] = useState(false);
  useEffect(() => {
    if (!kitchenMode) return;
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setMobileViewport(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [kitchenMode]);
  const [mobileReadyLane, setMobileReadyLane] = useState<MobileReadyLane>('waiting');
  const [scope, setScope] = useState<{ brandId?: string; locationId?: string }>(fixedScope ?? (initialLocations?.[0] ? { brandId: initialLocations[0].brandId, locationId: initialLocations[0].locationId } : {}));
  const [filters, setFilters] = useState(() => ({ search: '', dateFrom: kitchenMode ? kitchenDay(Date.now()) : '', dateTo: kitchenMode ? kitchenDay(Date.now()) : '' }));
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
  const mobileLocationName = pinnedLocation?.locationName || locations.find(row => row.brandId === scope.brandId && row.locationId === scope.locationId)?.locationName || t('Restaurant');
  const mobileTitle = view === 'history' ? t('Historik') : view === 'preorders' ? t('Forudbestillinger')
    : mobileStage === 'received' ? t('Nye bestillinger') : mobileStage === 'progress' ? t('I gang') : t('Klar');
  const selectMobileStage = (stage: MobileKdsStage) => { setMobileStage(stage); setSelected(null); setView('board'); };
  const status = kitchenMode && !automatic ? t("Manuel opdatering") : sleeping ? t("Nattilstand") : disconnected ? 'Offline' : outdated || connectionError ? t("Forbindelsen skal kontrolleres") : feed.reconnecting || boardFeed.reconnecting ? t("Genopretter forbindelse…") : feed.loading ? t("Opdaterer…") : t("Forbundet");
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
  useEffect(() => {
    const pending = (boardFeed.data?.orders ?? []).some(row => row.status === 'Received' && !isKitchenPreorder(row, now, settings));
    if (!kitchenMode || !repeatNewOrders || !pending || sleeping || authorizationPending || !boardFeed.freshForAlerts || !boardFeed.sound || boardFeed.soundError || boardFeed.volume === 0) { lastNewOrderAlarm.current = now; return; }
    if (now - lastNewOrderAlarm.current >= 30_000) { boardFeed.alertSound(); lastNewOrderAlarm.current = now; }
  }, [now, kitchenMode, repeatNewOrders, sleeping, authorizationPending, settings, boardFeed.data, boardFeed.freshForAlerts, boardFeed.sound, boardFeed.soundError, boardFeed.volume, boardFeed.alertSound]);
  const renderKitchenOrder = (row: TerminalOrder, mobileCard = false) => <TerminalDetail inline mobileCard={mobileCard} refreshRevision={feed.authorizedRevision} key={row.id} order={row} now={now} warningMinutes={settings.warningMinutes} overdueMinutes={settings.overdueMinutes} readyTimeEndpoint={`${actionApiBase}/ready-time`} statusEndpoint={`${actionApiBase}/status`} paymentEndpoint={fixedScope ? `${apiBase}/payment` : undefined} canEdit={(data?.canEdit ?? false) && !isKitchenPreorder(row, now, settings)} disabled={disconnected || outdated || !!connectionError} onClose={() => setSelected(null)} onChanged={refresh} reprint={data?.canEdit && !isKitchenPreorder(row, now, settings) ? <LazyKitchenReprint onAccessDenied={onAccessDenied} apiEndpoint={`${actionApiBase}/reprint`} orderId={row.id} brandId={row.brandId} locationId={row.locationId} /> : undefined} />;
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
  return <div lang={language} data-kds-fullscreen={immersive}
    className={immersive ? `fixed inset-0 ${kitchenMode ? 'z-[100] pb-28' : 'z-40'} space-y-5 overflow-y-auto overscroll-none bg-white p-4 text-slate-900`
      : kitchenMode ? '-mx-4 -mt-4 min-h-dvh bg-white pb-[calc(6rem+env(safe-area-inset-bottom))] text-slate-900 sm:-mx-6 sm:-mt-6 lg:mx-0 lg:mt-0 lg:min-h-[80dvh] lg:space-y-5 lg:p-3 lg:pb-3'
      : 'min-h-[80dvh] space-y-5 bg-white p-1 text-slate-900 sm:p-3'}
    style={immersive ? { touchAction: 'pan-y', overscrollBehavior: 'none' } : undefined}>
    {immersive && <button aria-label={t("Luk fuld skærm")} className="sticky top-0 z-[90] ml-auto block min-h-14 min-w-14 rounded-xl border-2 bg-white text-3xl font-bold" onClick={() => { setImmersive(false); if (document.fullscreenElement) void document.exitFullscreen(); }}>×</button>}
    {kitchenMode && <div className="sticky top-0 z-30 lg:hidden">
      {(boardFeed.soundError || !boardFeed.sound) && <aside role="status" className="flex items-start gap-3 bg-amber-50 px-4 py-3 text-sm text-slate-900">
        <VolumeX aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
        <div className="min-w-0 flex-1"><strong className="block font-semibold">{boardFeed.sound ? t('KDS-lyden skal aktiveres') : t('KDS-lyden er slået fra')}</strong>
          <p className="mt-1 text-slate-600">{boardFeed.soundError ? t(boardFeed.soundError) : t('Du får ikke lyd ved nye ordrer, før lyden er aktiveret.')}</p>
          <button type="button" className="mt-2 rounded-lg bg-white px-4 py-2 font-semibold shadow-sm" onClick={() => void boardFeed.testSound()}>{t('Test lyd')}</button>
        </div>
      </aside>}
      <header className="sticky top-0 z-30 flex min-h-[80px] items-center gap-3 border-b bg-white px-4 py-3">
        <button id="kds-menu-trigger-mobile" type="button" aria-label={t('Åbn menu')} aria-controls="kds-settings" aria-expanded={menuOpen}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-slate-100" onClick={() => setMenuOpen(true)}>
          <Menu aria-hidden="true" className="h-6 w-6" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-extrabold tracking-tight">{mobileTitle}</h1>
        <button type="button" aria-label={t("Fuld skærm")} title={t("Fuld skærm")}
          onClick={() => void fullscreen()} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border" >
          <Maximize aria-hidden="true" className="h-5 w-5" />
        </button>
        <span role="status" aria-label={status} title={status} className="flex h-12 shrink-0 items-center gap-2 rounded-xl border px-3">
          <span className={`h-3 w-3 rounded-full ${disconnected || outdated || !!connectionError ? 'bg-amber-500' : !live ? 'bg-slate-400' : 'bg-green-500'}`} />
          <Store aria-hidden="true" className="h-5 w-5" />
        </span>
      </header>
    </div>}
    <header className={kitchenMode ? "hidden flex-wrap items-center justify-between gap-4 lg:flex" : "flex flex-wrap items-center justify-between gap-4"}><div className="flex items-center gap-3">{kitchenMode && <button id="kds-menu-trigger" aria-label="Menu" aria-expanded={menuOpen} aria-controls="kds-settings" className="min-h-12 min-w-12 rounded-xl border text-2xl" onClick={() => setMenuOpen(value => !value)}>☰</button>}<h1 className="text-2xl font-bold">{' '}{t("Dagens ordrer")}{' '}</h1></div>
      <div className="mx-auto text-center text-lg font-semibold">{pinnedLocation ? pinnedLocation.locationName : fixedScope ? data?.locations.find(row => row.locationId === fixedScope.locationId)?.locationName || t("Indlæser…") : <select aria-label={kitchenMode ? t("Lokation") : 'Restaurant'} className="min-h-12 rounded-lg border bg-white px-3" value={selectedScope} disabled={!locations.length} onChange={event => {const location=locations.find(row=>`${row.brandId}/${row.locationId}`===event.target.value);if(location){setSelected(null);setPreorderNotice([]);setScope({brandId:location.brandId,locationId:location.locationId});}}}>{!locations.length && <option value="">{' '}{t("Indlæser…")}{' '}</option>}{locations.map(location=><option key={`${location.brandId}/${location.locationId}`} value={`${location.brandId}/${location.locationId}`}>{location.locationName}</option>)}</select>}</div>
      <div className="ml-auto text-right text-sm"><span role="status">{status}</span>{feed.lastUpdated && <span className="ml-2 text-slate-500">{' '}{t("Senest")}{' '}{new Date(feed.lastUpdated).toLocaleTimeString('da-DK',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>}</div>
    </header>
    {kitchenMode ? <KdsMenu open={menuOpen} onOpenChange={setMenuOpen} openingHours={boardFeed.data?.openingHours}
      mobileNavigation={<div className="space-y-4">
        <p className="flex items-center gap-2 text-lg font-bold"><Store aria-hidden="true" className="h-6 w-6" />{mobileLocationName}</p>
        {!fixedScope && !pinnedLocation && locations.length > 1 && <label className="block text-sm font-semibold">{t('Lokation')}
          <select aria-label={t('Lokation')} value={selectedScope} className="mt-2 min-h-12 w-full rounded-xl border bg-white p-3"
            onChange={event => { const location = locations.find(row => `${row.brandId}/${row.locationId}` === event.target.value); if (location) {
              setScope({brandId:location.brandId,locationId:location.locationId}); setSelected(null); setPreorderNotice([]); setMenuOpen(false);
            } }}>
            {locations.map(row => <option key={`${row.brandId}/${row.locationId}`} value={`${row.brandId}/${row.locationId}`}>{row.locationName}</option>)}
          </select>
        </label>}
        <nav aria-label={t('Mobil navigation')} className="space-y-2">
          {([
            { icon: ClipboardList, active: view === 'board', label: t('Aktive ordrer'), select: () => { selectMobileStage('received'); setMenuOpen(false); } },
            { icon: CalendarClock, active: view === 'preorders', label: t('Forudbestillinger'), select: () => { setView('preorders'); setSelected(null); setMenuOpen(false); } },
            { icon: History, active: view === 'history', label: t('Historik'), select: () => { setView('history'); setSelected(null); setMenuOpen(false); } },
          ]).map(option => <button key={option.label} type="button" onClick={option.select}
            aria-current={option.active ? 'page' : undefined} className={`flex min-h-16 w-full items-center gap-4 rounded-xl px-4 text-left text-lg font-semibold ${option.active ? 'bg-sky-500 text-white' : 'hover:bg-slate-50'}`}><option.icon aria-hidden="true" className="h-6 w-6 shrink-0" />{option.label}</button>)}
        </nav>

      </div>}
      notificationSettings={<label className="flex items-center gap-4"><span className="flex-1"><strong className="block">{t('Gentag alarm ved nye ordrer')}</strong><span className="mt-1 block text-sm text-slate-500">{t('Hvert 30. sekund, indtil tilberedningen er startet. Kræver friske data.')}</span></span><span className="relative shrink-0"><input type="checkbox" role="switch" aria-label={t('Gentag alarm ved nye ordrer')} checked={repeatNewOrders} onChange={event => { setRepeatNewOrders(event.target.checked); try { localStorage.setItem('orderfly.kds.repeatNewOrders', String(event.target.checked)); } catch {} }} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" /><span aria-hidden="true" className="block h-8 w-14 rounded-full bg-slate-200 transition-colors peer-checked:bg-green-500 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-600 peer-focus-visible:ring-offset-2" /><span aria-hidden="true" className="absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-6" /></span></label>}
      logout={onLogout || logoutControl ? <>{onLogout && <button className="min-h-12 rounded-xl border bg-white px-4 font-medium" onClick={onLogout}>{t("Log ud")}</button>}{logoutControl}</> : null}
      sound={<div className="space-y-5 pt-2 [&>label]:justify-between [&>label]:border-b [&>label]:pb-5 [&>button]:min-h-14">
        {kitchenMode && <button className="min-h-12 rounded-xl border px-4 font-medium" aria-pressed={boardFeed.sound} onClick={() => void boardFeed.toggleSound()}>{boardFeed.sound ? t("Slå lyd fra") : t("Slå lyd til")}</button>}
        <label className="flex items-center gap-3">{' '}{t("Lyd")}{' '}<select aria-label={t("Vælg lyd")} className="min-h-12 rounded-lg border bg-white p-3" value={boardFeed.soundId} onChange={event => boardFeed.setSoundId(event.target.value)}>{Object.entries(TERMINAL_SOUNDS).map(([id, value]) => <option key={id} value={id}>{t(value.name)}</option>)}</select></label>
        <button className="min-h-12 rounded-xl border bg-white px-4 font-medium" onClick={() => void boardFeed.testSound()}>{' '}{t("Test lyd")}{' '}</button>

        <label className="flex items-center gap-3">{' '}{t("Lydstyrke")}{' '}<input aria-label={t("Lydstyrke")} type="range" min="0" max="100" step="5" value={boardFeed.volume} onChange={event => boardFeed.setVolume(Number(event.target.value))} />
          <output>{boardFeed.volume}%</output>
        </label>
        <p className="text-sm text-slate-600">{' '}{t("Melodi på 3,6 sekunder. Enhedens egen lydstyrke gælder også.")}{' '}</p>
        {boardFeed.soundError && <p role="status" className="w-full text-sm text-amber-900">{t(boardFeed.soundError)}</p>}
      </div>}
      orders={<div className="space-y-5 py-2"><label className="flex items-center gap-3"><input type="checkbox" aria-label={t("Automatisk opdatering")} checked={automatic} onChange={event => { setAutomatic(event.target.checked); try { localStorage.setItem('orderfly.kds.automatic', String(event.target.checked)); } catch {} }} />{' '}{t("Automatisk opdatering på denne enhed")}{' '}</label><p className="text-sm">{' '}{t("Slå fra for kun at hente data ved Opdater eller egne ordrehandlinger. Nye ordrer og alarmer kræver friske data.")}{' '}</p><KdsSettingsForm settings={settings} revision={boardFeed.data?.kitchenSettingsRevision ?? 0} brandId={scope.brandId} locationId={scope.locationId} endpoint={`${apiBase}/settings`} canEdit={!!boardFeed.data?.canEdit} onSaved={refresh} /></div>} /> : (<><button className="min-h-12 rounded-xl border px-4" aria-pressed={boardFeed.sound} onClick={() => void boardFeed.toggleSound()}>{boardFeed.sound ? t('Slå lyd fra') : t('Slå lyd til')}</button><details className="rounded-xl border bg-slate-50 p-3">
      <summary className="min-h-10 cursor-pointer font-semibold">{' '}{t("Lydindstillinger ·")}{' '}{boardFeed.sound ? t("Til") : t("Fra")} · {boardFeed.volume}%</summary>
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <label className="flex items-center gap-3">{' '}{t("Lyd")}{' '}<select aria-label={t("Vælg lyd")} className="min-h-12 rounded-lg border bg-white p-3" value={boardFeed.soundId} onChange={event => boardFeed.setSoundId(event.target.value)}>{Object.entries(TERMINAL_SOUNDS).map(([id, value]) => <option key={id} value={id}>{t(value.name)}</option>)}</select></label>
        <button className="min-h-12 rounded-xl border bg-white px-4 font-medium" onClick={() => void boardFeed.testSound()}>{' '}{t("Test lyd")}{' '}</button>
        <label className="flex items-center gap-3">{' '}{t("Lydstyrke")}{' '}<input aria-label={t("Lydstyrke")} type="range" min="0" max="100" step="5" value={boardFeed.volume} onChange={event => boardFeed.setVolume(Number(event.target.value))} />
          <output>{boardFeed.volume}%</output>
        </label>
        <p className="text-sm text-slate-600">{' '}{t("Melodi på 3,6 sekunder. Enhedens egen lydstyrke gælder også.")}{' '}</p>
      </div>
    </details></>)}

    <div className={kitchenMode ? "hidden flex-wrap items-center justify-between gap-3 border-b pb-3 lg:flex" : "flex flex-wrap items-center justify-between gap-3 border-b pb-3"}>
      {kitchenMode && view === 'board' && <div className="flex flex-wrap items-center gap-3"><label className="text-sm font-semibold">{' '}{t("Ordredato")}{' '}<input aria-label={t("Ordredato")} type="date" value={day} onChange={event => setChosenDate(event.target.value)} className="ml-2 min-h-12 w-40 rounded-lg border p-2 text-base" /></label><button className="min-h-12 rounded-lg border px-4 font-semibold" onClick={() => setChosenDate('')}>{' '}{t("I dag")}{' '}</button></div>}
    <nav aria-label={t("Ordrevisning")} className="ml-auto flex flex-wrap justify-end gap-1">{tabs.map(tab => <button key={tab.value} aria-current={view === tab.value ? 'page' : undefined} className={`min-h-12 rounded-xl px-2 text-sm font-semibold ${view === tab.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`} onClick={() => { setSelected(null); setView(tab.value); }}>{tab.value === 'board' ? <ClipboardList aria-hidden="true" className="mr-2 inline h-5 w-5" /> : tab.value === 'preorders' ? <CalendarClock aria-hidden="true" className="mr-2 inline h-5 w-5" /> : <History aria-hidden="true" className="mr-2 inline h-5 w-5" />}{t(tab.label)}{' '}{kitchenMode && tab.value !== 'history' && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-sm text-slate-900">{tab.value === 'preorders' ? preorders.filter(row => row.status === 'Received').length : activeKitchenOrders.filter(row => row.status === 'Received').length}</span>}</button>)}<button aria-label={t("Fuld skærm")} title={t("Fuld skærm")} className="min-h-12 min-w-12 rounded-xl border px-3" onClick={() => void fullscreen()}><Maximize aria-hidden="true" className="h-5 w-5" /></button><button aria-label={t("Opdater")} title={t("Opdater")} className="min-h-12 min-w-12 rounded-xl bg-slate-900 px-3 text-white disabled:opacity-50" onClick={refresh} disabled={feed.loading}><RefreshCw aria-hidden="true" className="h-5 w-5" /></button></nav>
    </div>
    {boardFeed.newOrders > 0 && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 font-semibold text-blue-900"><span>{boardFeed.newOrders === 1 ? t("Der er kommet en ny ordre") : `Der er kommet ${boardFeed.newOrders} nye ordrer`}</span><button className="min-h-11 rounded-lg border border-blue-200 px-4" onClick={() => { if (kitchenMode) selectMobileStage('received'); else setView('board'); boardFeed.clearNewOrders(); }}>{' '}{t("Vis nye ordrer")}{' '}</button></div>}
    {((!kitchenMode && boardFeed.soundError) || screenMessage) && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">{(!kitchenMode && boardFeed.soundError) || screenMessage}</p>}
    {connectionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4"><p>{t(connectionError)}</p><p className="mt-1 text-sm">{' '}{t("Viste ordrer kan være forældede. Ingen ændring er bekræftet af denne fejl.")}{' '}</p><button className="mt-2 min-h-11 rounded-lg border bg-white px-4" disabled={feed.loading} onClick={refresh}>{' '}{t("Prøv igen")}{' '}</button>{connectionError.includes('Log ind') && <a href={loginHref} className="ml-4 underline">{' '}{t("Log ind igen")}{' '}</a>}</div>}

    {kitchenMode && !authorizationPending && preorderNotice.length > 0 && <section role="alertdialog" aria-label={t("Forudbestilling modtaget")} className="fixed inset-x-4 top-20 z-[120] mx-auto max-w-lg space-y-4 rounded-2xl border-4 border-blue-600 bg-white p-6 shadow-2xl"><h2 className="text-2xl font-bold">{' '}{t("Forudbestilling modtaget")}{' '}</h2><p>{preorderNotice.join(', ')}</p><button className="min-h-14 rounded-xl bg-slate-900 px-6 text-lg font-semibold text-white" onClick={() => { setView('preorders'); setPreorderNotice([]); boardFeed.clearNewOrders(); }}>{' '}{t("Vis forudbestillinger")}{' '}</button><button className="ml-3 min-h-14 rounded-xl border px-6" onClick={() => setPreorderNotice([])}>{' '}{t("Luk")}{' '}</button></section>}
    {view === 'board' && kitchenMode && mobileViewport && <MobileKdsBoard orders={data ? activeKitchenOrders : []}
      stage={mobileStage} readyLane={mobileReadyLane} onReadyLaneChange={setMobileReadyLane}
      renderOrder={row => renderKitchenOrder(row, true)} loading={feed.loading}
      unavailable={authorizationPending || !!connectionError || !data}
      hasMore={data?.hasMore} onLoadMore={feed.loadMore} />}
    {view === 'board' && (!kitchenMode || !mobileViewport) && <div className={kitchenMode ? 'hidden lg:block' : undefined}><TerminalBoard renderOrder={kitchenMode ? renderKitchenOrder : undefined} orders={kitchenMode ? (data ? activeKitchenOrders : []) : data?.orders ?? []} loading={feed.loading} onSelectOrder={choose} hasMore={data?.hasMore} onLoadMore={feed.loadMore} /></div>}
    {view === 'history' && <TerminalHistory mobileLayout={kitchenMode} error={connectionError || undefined} onRetry={refresh} orders={data?.orders ?? []} filters={filters} onFiltersChange={setFilters} loading={feed.loading} onSelectOrder={choose} onReprint={data?.canEdit ? choose : undefined} hasMore={data?.hasMore} onLoadMore={feed.loadMore} onLoadAll={feed.loadAllHistory} />}
    {view === 'preorders' && <TerminalPreorders error={connectionError || undefined} onRetry={refresh} orders={kitchenMode ? (data ? preorders : []) : data?.orders ?? []} loading={feed.loading} onSelectOrder={choose} onReprint={!kitchenMode && data?.canEdit ? choose : undefined} hasMore={data?.hasMore} onLoadMore={feed.loadMore} serverTime={data?.serverTime} />}
    {data && order && kitchenMode && <div><button className="min-h-12 rounded-lg border px-4" onClick={() => setSelected(null)}>{' '}{t("Luk ordrevisning")}{' '}</button>{renderKitchenOrder(order)}</div>}
    {data && order && !kitchenMode && <TerminalDetail refreshRevision={feed.authorizedRevision} key={order.id} order={order} statusEndpoint={`${actionApiBase}/status`} paymentEndpoint={fixedScope ? `${apiBase}/payment` : undefined} canEdit={data?.canEdit ?? false} disabled={disconnected || outdated || !!connectionError} onClose={() => setSelected(null)} onChanged={refresh} reprint={data?.canEdit ? <TerminalReprint onAccessDenied={onAccessDenied} apiEndpoint={`${actionApiBase}/reprint`} orderId={order.id} brandId={order.brandId} locationId={order.locationId} /> : undefined} />}
    {!kitchenMode && <p className="text-xs text-slate-500">Hold siden åben for nye ordrer. Lyden skal aktiveres med et tryk og kan sættes på pause, når iPad låses.</p>}
    {kitchenMode && <MobileKdsBottomNav stage={view === 'board' ? mobileStage : null} orders={authorizationPending ? [] : activeKitchenOrders} onSelect={selectMobileStage} />}
  </div>;
}

function LazyKitchenReprint(props: Parameters<typeof TerminalReprint>[0]) {
  const {t, language} = useKdsLanguage();
  const [opened, setOpened] = useState(false);
  return <details className="rounded-lg border p-3" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}><summary className="min-h-12 cursor-pointer font-semibold">{' '}{t("Genprint")}{' '}</summary>{opened && <TerminalReprint {...props} />}</details>;
}
