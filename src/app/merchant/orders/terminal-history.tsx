'use client';
import { useKdsLanguage } from './kds-language';

import { CalendarDays, Eye, Printer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { TerminalOrder } from '@/lib/orders/terminal-types';
import { ORDER_STATUS_LABELS } from '@/lib/orders/presentation';
import { formatPrice } from '@/lib/storefront-format';
import { EMPTY_HISTORY_FILTERS, historyFilterError, terminalDateTime, terminalDateHeading, terminalDay, type TerminalHistoryFilters } from './terminal-filters';

export type TerminalHistoryProps = {
  orders: TerminalOrder[];
  mobileLayout?: boolean;
  filters: TerminalHistoryFilters;
  onFiltersChange: (filters: TerminalHistoryFilters) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectOrder: (order: TerminalOrder) => void;
  onReprint?: (order: TerminalOrder) => void;
  renderReprint?: (order: TerminalOrder) => ReactNode;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onLoadAll?: () => void;
};

export function TerminalHistory({ mobileLayout = false, orders, filters, onFiltersChange, loading = false, error, onRetry, onSelectOrder, onReprint, renderReprint, hasMore, onLoadMore, onLoadAll }: TerminalHistoryProps) {
  const {t, language} = useKdsLanguage();
  const mobileGroups = new Map<string, TerminalOrder[]>();
  for (const order of orders) { const key = terminalDay(order.createdAt) || 'unknown'; mobileGroups.set(key, [...(mobileGroups.get(key) || []), order]); }
  const [draft, setDraft] = useState(filters);
  const [validation, setValidation] = useState<string | null>(null);
  useEffect(() => { setDraft(filters); setValidation(null); }, [filters.search, filters.dateFrom, filters.dateTo]);
  return <section aria-label={t("Ordrehistorik")} aria-busy={loading} className={`space-y-5 min-w-0 ${mobileLayout ? 'px-4 lg:px-0' : ''}`}>
    <div className={mobileLayout ? "hidden lg:block" : ""}><h2 className="text-2xl font-semibold">{' '}{t("Ordrehistorik")}{' '}</h2><p className="mt-1 text-sm text-muted-foreground">{' '}{t("Find tidligere ordrer, se detaljer og genprint en bon.")}{' '}</p></div>
    <p role="status" className="text-xl font-semibold">{error ? (language === 'en' ? 'Total unavailable' : 'Samlet beløb ikke bekræftet') : loading ? t("Beregner samlet beløb…") : hasMore ? t("Hent alle matchende ordrer for at se det samlede beløb.") : `${language === 'en' ? 'Total amount' : 'Samlet beløb'}: ${formatPrice(orders.reduce((sum, order) => sum + Math.round(order.totalAmount * 100), 0) / 100)} · ${orders.length} ${language === 'en' ? 'orders' : 'ordrer'}`}</p>
    {hasMore && onLoadAll && <button type="button" disabled={loading || !!error} onClick={onLoadAll} className="min-h-12 rounded-lg border px-5 font-semibold disabled:opacity-50">{t("Beregn samlet beløb for alle ordrer")}</button>}
    {mobileLayout && <div className="flex min-w-0 flex-wrap items-center gap-3 border-y py-3 lg:hidden">
      <label className="flex min-w-0 items-center gap-2 rounded-full bg-slate-100 px-4 py-2 font-semibold"><CalendarDays aria-hidden="true" className="h-5 w-5 shrink-0" />{t('Dato')}<input aria-label={t('Historikdato')} type="date" value={filters.dateFrom === filters.dateTo ? filters.dateFrom : ''} disabled={loading} onChange={event => { if (event.target.value) onFiltersChange({search:'',dateFrom:event.target.value,dateTo:event.target.value}); }} className="min-h-10 min-w-0 max-w-[11rem] bg-transparent" /></label>
      <button type="button" disabled={loading} className="min-h-12 rounded-full bg-slate-100 px-4 font-semibold" onClick={() => {const today=terminalDay(new Date().toISOString())!;onFiltersChange({search:'',dateFrom:today,dateTo:today});}}>{t('I dag')}</button>
    </div>}
    <form className={`${mobileLayout ? 'hidden lg:flex' : 'flex'} flex-wrap items-end gap-3 rounded-xl border bg-background p-4`} onSubmit={event => {
      event.preventDefault(); const problem = historyFilterError(draft); setValidation(problem);
      if (!problem) onFiltersChange({ ...draft, search: draft.search.trim() });
    }}>
      <label className="min-w-0 flex-1 basis-48 text-sm font-medium">{' '}{t("Søg ordre eller kunde")}{' '}<input type="search" maxLength={100} value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })} placeholder={t("Ordrenummer eller navn")} className="mt-1 block h-12 w-full rounded-lg border bg-background px-3 font-normal" />
      </label>
      <label className="min-w-0 text-sm font-medium">{' '}{t("Bestillingsdato fra")}{' '}<input type="date" value={draft.dateFrom} onChange={event => setDraft({ ...draft, dateFrom: event.target.value })} className="mt-1 block h-12 max-w-full rounded-lg border bg-background px-3 font-normal" />
      </label>
      <label className="min-w-0 text-sm font-medium">{' '}{t("Bestillingsdato til")}{' '}<input type="date" value={draft.dateTo} onChange={event => setDraft({ ...draft, dateTo: event.target.value })} className="mt-1 block h-12 max-w-full rounded-lg border bg-background px-3 font-normal" />
      </label>
      <button type="submit" disabled={loading} className="min-h-12 rounded-lg bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">{' '}{t("Søg")}{' '}</button>
      <button type="button" disabled={loading} className="min-h-12 rounded-lg border px-4 font-medium disabled:opacity-50" onClick={() => { setDraft(EMPTY_HISTORY_FILTERS); setValidation(null); onFiltersChange({ ...EMPTY_HISTORY_FILTERS }); }}>{' '}{t("Nulstil")}{' '}</button>
      {validation && <p role="alert" className="basis-full text-sm text-red-700">{validation && t(validation)}</p>}
    </form>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><span>{error} {' '}{t("Tidligere viste data kan være forældede.")}{' '}</span>{onRetry && <button type="button" onClick={onRetry} disabled={loading} className="min-h-12 rounded-lg border border-red-300 px-4 font-semibold">{' '}{t("Prøv igen")}{' '}</button>}</div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">{' '}{t("Henter ordrehistorik…")}{' '}</p>}
    {!orders.length && !loading && !error && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{hasMore ? t("Ingen match på denne del af historikken. Hent flere for at fortsætte søgningen.") : t("Ingen ordrer matcher din søgning.")}</p>}
    {!!orders.length && <div className={`${mobileLayout ? 'hidden lg:block' : ''} overflow-x-auto rounded-xl border bg-background`}>
      <table className="w-full whitespace-nowrap text-left text-sm"><caption className="sr-only">{' '}{t("Ordrehistorik for den valgte restaurant. Alle tidspunkter er dansk tid.")}{' '}</caption>
        <thead className="bg-muted/50 text-muted-foreground"><tr>{[t("Dato / tid"),t("Ordre / kunde"),t("Beløb"),'Status',t("Handlinger")].map(label=><th key={label} scope="col" className="p-4">{label}</th>)}</tr></thead>
        <tbody className="divide-y">{orders.map(order=><tr key={order.id}>
          <td className="p-4 align-top">{terminalDateTime(order.createdAt, language)}</td>
          <td className="p-4 align-top"><span className="font-semibold">{order.id.replace(/^ORD[-\s]*/i, '')}</span> / {order.customerName || t("Kunde")}</td>
          <td className="p-4 align-top font-semibold">{formatPrice(order.totalAmount)}{order.refundedAmountOre>0 && <span className="ml-2 text-xs font-normal">{' '}{t("Refunderet:")}{' '}{formatPrice(order.refundedAmountOre/100)}</span>}</td>
          <td className="p-4 align-top"><span>{t(ORDER_STATUS_LABELS[order.status])}</span> / <span>{order.paymentStatus==='Paid'?t("Betalt"):order.paymentStatus==='Failed'?t("Betaling fejlet"):t("Ikke betalt")}</span></td>
          <td className="p-4 align-top"><div className="flex gap-2"><button type="button" aria-label={`${t("Vis ordre")} ${order.id}`} title={t("Vis ordre")} className="min-h-12 min-w-12 rounded-lg border p-3" onClick={()=>onSelectOrder(order)}><Eye aria-hidden="true" className="h-5 w-5" /></button>{renderReprint ? renderReprint(order) : onReprint && <button type="button" aria-label={`${t("Genprint ordre")} ${order.id}`} title={t("Genprint")} disabled={loading||!!error} className="min-h-12 min-w-12 rounded-lg border p-3 disabled:opacity-50" onClick={()=>onReprint(order)}><Printer aria-hidden="true" className="h-5 w-5" /></button>}</div></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {mobileLayout && !!orders.length && <div className="lg:hidden">{[...mobileGroups.entries()].map(([day, rows]) => <section key={day} aria-label={day}>
      <h3 className="border-b py-4 text-lg font-bold">{day === terminalDay(new Date().toISOString()) ? t('I dag') : terminalDateHeading(rows[0].createdAt, language)}</h3>
      <div className="divide-y">{rows.map(order => <article key={order.id} className="py-4">
        <button type="button" aria-label={`${t('Vis ordre')} ${order.id}`} onClick={() => onSelectOrder(order)} className="block min-h-20 w-full text-left">
          <span className="flex items-center justify-between gap-3"><strong className="rounded-xl bg-slate-100 px-3 py-2 text-lg">#{order.id.replace(/^ORD[-\s]*/i, '')}</strong><strong className="shrink-0 text-lg">{formatPrice(order.totalAmount)}</strong></span>
          <span className="mt-2 block break-words text-lg font-semibold">{order.customerName || t('Kunde')}</span>
          <span className="mt-1 block text-sm text-slate-500">{terminalDateTime(order.createdAt, language)} · {t(ORDER_STATUS_LABELS[order.status])} / {order.paymentStatus === 'Paid' ? t('Betalt') : order.paymentStatus === 'Failed' ? t('Betaling fejlet') : t('Ikke betalt')}</span>
        </button>
        {order.refundedAmountOre > 0 && <p className="mt-2 text-sm">{t('Refunderet:')} {formatPrice(order.refundedAmountOre/100)}</p>}
        {renderReprint ? renderReprint(order) : onReprint && <button type="button" disabled={loading || !!error} aria-label={`${t('Genprint ordre')} ${order.id}`} onClick={() => onReprint(order)} className="mt-2 flex min-h-12 items-center gap-2 rounded-full bg-slate-100 px-4 text-sm font-semibold disabled:opacity-50"><Printer aria-hidden="true" className="h-4 w-4" />{t('Genprint')}</button>}
      </article>)}</div>
    </section>)}</div>}
    {hasMore && onLoadMore && <button type="button" onClick={onLoadMore} disabled={loading || !!error} className="min-h-12 w-full rounded-lg border bg-background px-5 font-semibold disabled:opacity-50">{loading ? t("Henter…") : t("Hent flere ordrer")}</button>}
    <p className="text-xs text-muted-foreground">{' '}{t("Datoer og tidspunkter vises i dansk tid. Restaurant vælges øverst på siden.")}{' '}</p>
  </section>;
}
