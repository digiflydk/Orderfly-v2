'use client';
import { useKdsLanguage } from './kds-language';

import { Eye, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TerminalOrder } from '@/lib/orders/terminal-types';
import { ORDER_STATUS_LABELS } from '@/lib/orders/presentation';
import { formatPrice } from '@/lib/storefront-format';
import { EMPTY_HISTORY_FILTERS, historyFilterError, terminalDateTime, type TerminalHistoryFilters } from './terminal-filters';

export type TerminalHistoryProps = {
  orders: TerminalOrder[];
  filters: TerminalHistoryFilters;
  onFiltersChange: (filters: TerminalHistoryFilters) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectOrder: (order: TerminalOrder) => void;
  onReprint?: (order: TerminalOrder) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onLoadAll?: () => void;
};

export function TerminalHistory({ orders, filters, onFiltersChange, loading = false, error, onRetry, onSelectOrder, onReprint, hasMore, onLoadMore, onLoadAll }: TerminalHistoryProps) {
  const {t, language} = useKdsLanguage();
  const [draft, setDraft] = useState(filters);
  const [validation, setValidation] = useState<string | null>(null);
  useEffect(() => { setDraft(filters); setValidation(null); }, [filters.search, filters.dateFrom, filters.dateTo]);
  return <section aria-label={t("Ordrehistorik")} aria-busy={loading} className="space-y-5 min-w-0">
    <div><h2 className="text-2xl font-semibold">{' '}{t("Ordrehistorik")}{' '}</h2><p className="mt-1 text-sm text-muted-foreground">{' '}{t("Find tidligere ordrer, se detaljer og genprint en bon.")}{' '}</p></div>
    <p role="status" className="text-xl font-semibold">{error ? (language === 'en' ? 'Total unavailable' : 'Samlet beløb ikke bekræftet') : loading ? t("Beregner samlet beløb…") : hasMore ? t("Hent alle matchende ordrer for at se det samlede beløb.") : `${language === 'en' ? 'Total amount' : 'Samlet beløb'}: ${formatPrice(orders.reduce((sum, order) => sum + Math.round(order.totalAmount * 100), 0) / 100)} · ${orders.length} ${language === 'en' ? 'orders' : 'ordrer'}`}</p>
    {hasMore && onLoadAll && <button type="button" disabled={loading || !!error} onClick={onLoadAll} className="min-h-12 rounded-lg border px-5 font-semibold disabled:opacity-50">{t("Beregn samlet beløb for alle ordrer")}</button>}
    <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4" onSubmit={event => {
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
    {!!orders.length && <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="w-full text-left text-sm"><caption className="sr-only">{' '}{t("Ordrehistorik for den valgte restaurant. Alle tidspunkter er dansk tid.")}{' '}</caption>
        <thead className="bg-muted/50 text-muted-foreground"><tr>{[t("Dato / tid"),t("Ordre / kunde"),t("Beløb"),'Status',t("Handlinger")].map(label=><th key={label} scope="col" className="p-4">{label}</th>)}</tr></thead>
        <tbody className="divide-y">{orders.map(order=><tr key={order.id}>
          <td className="p-4 align-top">{terminalDateTime(order.createdAt, language)}</td>
          <td className="p-4 align-top"><p className="font-semibold">{order.id}</p><p>{order.customerName || t("Kunde")}</p></td>
          <td className="p-4 align-top font-semibold">{formatPrice(order.totalAmount)}{order.refundedAmountOre>0 && <p className="text-xs font-normal">{' '}{t("Refunderet:")}{' '}{formatPrice(order.refundedAmountOre/100)}</p>}</td>
          <td className="p-4 align-top"><p>{t(ORDER_STATUS_LABELS[order.status])}</p><p className="text-xs">{order.paymentStatus==='Paid'?t("Betalt"):order.paymentStatus==='Failed'?t("Betaling fejlet"):t("Ikke betalt")}</p></td>
          <td className="p-4 align-top"><div className="flex gap-2"><button type="button" aria-label={`${t("Vis ordre")} ${order.id}`} title={t("Vis ordre")} className="min-h-12 min-w-12 rounded-lg border p-3" onClick={()=>onSelectOrder(order)}><Eye aria-hidden="true" className="h-5 w-5" /></button>{onReprint && <button type="button" aria-label={`${t("Genprint ordre")} ${order.id}`} title={t("Genprint")} disabled={loading||!!error} className="min-h-12 min-w-12 rounded-lg border p-3 disabled:opacity-50" onClick={()=>onReprint(order)}><Printer aria-hidden="true" className="h-5 w-5" /></button>}</div></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {hasMore && onLoadMore && <button type="button" onClick={onLoadMore} disabled={loading || !!error} className="min-h-12 w-full rounded-lg border bg-background px-5 font-semibold disabled:opacity-50">{loading ? t("Henter…") : t("Hent flere ordrer")}</button>}
    <p className="text-xs text-muted-foreground">{' '}{t("Datoer og tidspunkter vises i dansk tid. Restaurant vælges øverst på siden.")}{' '}</p>
  </section>;
}
