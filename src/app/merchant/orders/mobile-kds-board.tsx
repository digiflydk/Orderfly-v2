'use client';

import type { ReactNode } from 'react';
import { CheckCheck, ChefHat, Layers3, Sparkles, Truck } from 'lucide-react';
import type { TerminalOrder } from '@/lib/orders/terminal-types';
import { mobileKdsCounts, mobileKdsOrders, type MobileKdsStage, type MobileReadyLane } from '@/lib/orders/mobile-kds';
import { useKdsLanguage } from './kds-language';

export function MobileKdsBoard({ orders, stage, readyLane, onReadyLaneChange, renderOrder, loading, unavailable = false, hasMore, onLoadMore }: {
  orders: TerminalOrder[];
  stage: MobileKdsStage;
  readyLane: MobileReadyLane;
  onReadyLaneChange: (value: MobileReadyLane) => void;
  renderOrder: (order: TerminalOrder) => ReactNode;
  loading?: boolean;
  unavailable?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}) {
  const { t } = useKdsLanguage();
  const counts = mobileKdsCounts(orders);
  const rows = mobileKdsOrders(orders, stage, readyLane);
  const empty = unavailable ? { title: t('Ordrer er ikke tilgængelige'), description: t('Kontrollér forbindelsen, og opdatér køkkenoversigten.'), icon: CheckCheck }
    : stage === 'received'
    ? { title: t('Ingen nye bestillinger'), description: t('Nye bestillinger vil blive vist her automatisk.'), icon: Sparkles }
    : stage === 'progress'
    ? { title: t('Ingen ordrer i gang'), description: t('Ordrer under tilberedning vises her.'), icon: ChefHat }
    : readyLane === 'delivery'
    ? { title: t('Ingen ordrer i levering'), description: t('Afhentede leveringsordrer vises her.'), icon: Truck }
    : { title: t('Ingen ordrer klar'), description: t('Ordrer, der afventer afhentning, vises her.'), icon: CheckCheck };
  const EmptyIcon = empty.icon;

  return <section className="lg:hidden" aria-label={t('Mobil køkkenoversigt')}>
    {stage === 'ready' && <div role="tablist" aria-label={t('Klar eller i levering')} className="mx-4 my-4 grid grid-cols-2 rounded-full bg-slate-100 p-1">
      {([
        { id: 'waiting' as const, label: t('Klar'), count: counts.waiting },
        { id: 'delivery' as const, label: t('I levering'), count: counts.delivery },
      ]).map(tab => <button key={tab.id} type="button" role="tab" aria-selected={readyLane === tab.id}
        className={`min-h-12 rounded-full px-3 text-sm font-semibold transition-colors ${readyLane === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
        onClick={() => onReadyLaneChange(tab.id)}>{tab.label} ({tab.count})</button>)}
    </div>}
    <div className="min-h-[calc(100dvh-220px)] space-y-4 bg-slate-50 px-3 pb-6 pt-4">
      {rows.map(row => <div key={row.id}>{renderOrder(row)}</div>)}
      {!rows.length && <div className="flex min-h-[50dvh] flex-col items-center justify-center px-8 text-center">
        <EmptyIcon className="mb-5 h-12 w-12 text-slate-400" aria-hidden="true" />
        <h2 className="text-xl font-bold text-slate-900">{loading ? t('Henter ordrer…') : empty.title}</h2>
        {!loading && <p className="mt-3 max-w-sm text-base leading-7 text-slate-500">{empty.description}</p>}
      </div>}
      {hasMore && <div className="rounded-2xl border bg-amber-50 p-4 text-sm text-slate-800">
        <p>{t('Der er flere ordrer. Tallene viser de indlæste ordrer.')}</p>
        <button type="button" onClick={onLoadMore} disabled={loading}
          className="mt-3 min-h-12 w-full rounded-xl border bg-white px-4 font-semibold disabled:opacity-50">{t('Hent flere ordrer')}</button>
      </div>}
    </div>
  </section>;
}

export function MobileKdsBottomNav({ stage, orders, onSelect }: {
  stage: MobileKdsStage | null;
  orders: TerminalOrder[];
  onSelect: (stage: MobileKdsStage) => void;
}) {
  const { t } = useKdsLanguage();
  const counts = mobileKdsCounts(orders);
  const tabs = [
    { id: 'received' as const, label: t('Nye bestillinger'), icon: Sparkles, count: counts.received },
    { id: 'progress' as const, label: t('I gang'), icon: Layers3, count: counts.progress },
    { id: 'ready' as const, label: t('Klar'), icon: CheckCheck, count: counts.ready },
  ];
  return <nav aria-label={t('Køkkenstatus')} className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t bg-white shadow-[0_-2px_12px_rgba(0,0,0,0.05)] lg:hidden"
    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
    {tabs.map(tab => <button key={tab.id} type="button" aria-current={stage === tab.id ? 'page' : undefined}
      onClick={() => onSelect(tab.id)}
      className={`relative flex min-h-[76px] flex-col items-center justify-center gap-1 px-1 py-3 text-center text-xs font-semibold ${stage === tab.id ? 'text-sky-600' : 'text-slate-500'}`}>
      <span className="relative">
        <tab.icon className="h-7 w-7" aria-hidden="true" />
        {tab.count > 0 && <span aria-label={`${tab.count} ${tab.label}`}
          className="absolute -right-4 -top-2 grid min-h-6 min-w-6 place-items-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">{tab.count > 99 ? '99+' : tab.count}</span>}
      </span>
      <span>{tab.label}</span>
    </button>)}
  </nav>;
}
