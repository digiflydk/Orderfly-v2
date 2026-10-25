'use client';

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
};

export function TerminalHistory({ orders, filters, onFiltersChange, loading = false, error, onRetry, onSelectOrder, onReprint, hasMore, onLoadMore }: TerminalHistoryProps) {
  const [draft, setDraft] = useState(filters);
  const [validation, setValidation] = useState<string | null>(null);
  useEffect(() => { setDraft(filters); setValidation(null); }, [filters.search, filters.dateFrom, filters.dateTo]);
  return <section aria-label="Ordrehistorik" aria-busy={loading} className="space-y-5 min-w-0">
    <div><h2 className="text-2xl font-semibold">Ordrehistorik</h2><p className="mt-1 text-sm text-muted-foreground">Find tidligere ordrer, se detaljer og genprint en bon.</p></div>
    <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-4" onSubmit={event => {
      event.preventDefault(); const problem = historyFilterError(draft); setValidation(problem);
      if (!problem) onFiltersChange({ ...draft, search: draft.search.trim() });
    }}>
      <label className="min-w-0 flex-1 basis-48 text-sm font-medium">Søg ordre eller kunde
        <input type="search" maxLength={100} value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })} placeholder="Ordrenummer eller navn" className="mt-1 block h-12 w-full rounded-lg border bg-background px-3 font-normal" />
      </label>
      <label className="min-w-0 text-sm font-medium">Bestillingsdato fra
        <input type="date" value={draft.dateFrom} onChange={event => setDraft({ ...draft, dateFrom: event.target.value })} className="mt-1 block h-12 max-w-full rounded-lg border bg-background px-3 font-normal" />
      </label>
      <label className="min-w-0 text-sm font-medium">Bestillingsdato til
        <input type="date" value={draft.dateTo} onChange={event => setDraft({ ...draft, dateTo: event.target.value })} className="mt-1 block h-12 max-w-full rounded-lg border bg-background px-3 font-normal" />
      </label>
      <button type="submit" disabled={loading} className="min-h-12 rounded-lg bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">Søg</button>
      <button type="button" disabled={loading} className="min-h-12 rounded-lg border px-4 font-medium disabled:opacity-50" onClick={() => { setDraft(EMPTY_HISTORY_FILTERS); setValidation(null); onFiltersChange({ ...EMPTY_HISTORY_FILTERS }); }}>Nulstil</button>
      {validation && <p role="alert" className="basis-full text-sm text-red-700">{validation}</p>}
    </form>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><span>{error} Tidligere viste data kan være forældede.</span>{onRetry && <button type="button" onClick={onRetry} disabled={loading} className="min-h-12 rounded-lg border border-red-300 px-4 font-semibold">Prøv igen</button>}</div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Henter ordrehistorik…</p>}
    {!orders.length && !loading && !error && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{hasMore ? 'Ingen match på denne del af historikken. Hent flere for at fortsætte søgningen.' : 'Ingen ordrer matcher din søgning.'}</p>}
    {!!orders.length && <div className="overflow-x-auto rounded-xl border bg-background">
      <table className="w-full text-left text-sm"><caption className="sr-only">Ordrehistorik for den valgte restaurant. Alle tidspunkter er dansk tid.</caption>
        <thead className="bg-muted/50 text-muted-foreground"><tr><th scope="col" className="p-4">Ordre / kunde</th><th scope="col" className="p-4">Tid / restaurant</th><th scope="col" className="p-4">Beløb / status</th><th scope="col" className="p-4">Handlinger</th></tr></thead>
        <tbody className="divide-y">{orders.map(order => <tr key={order.id}>
          <td className="p-4 align-top"><button type="button" onClick={() => onSelectOrder(order)} className="min-h-12 text-left font-semibold underline underline-offset-4" aria-label={`Vis ordre ${order.id}`}>{order.id}</button><p className="break-words">{order.customerName || 'Kunde'}</p><p className="mt-1 text-xs text-muted-foreground">{order.deliveryType === 'Pickup' ? 'Afhentning' : 'Levering'}</p></td>
          <td className="p-4 align-top"><p>{terminalDateTime(order.createdAt)}</p><p className="mt-2 text-muted-foreground">{order.locationName || order.brandName}</p></td>
          <td className="p-4 align-top"><p className="font-semibold">{formatPrice(order.totalAmount)}</p><p className="mt-2">{ORDER_STATUS_LABELS[order.status]}</p><p className="mt-1 text-xs text-muted-foreground">{order.paymentStatus === 'Paid' ? 'Betalt' : order.paymentStatus === 'Failed' ? 'Betaling fejlet' : 'Ikke betalt'}</p>{order.refundedAmountOre > 0 && <p className="mt-1 text-xs">Refunderet: {formatPrice(order.refundedAmountOre / 100)}</p>}</td>
          <td className="p-4 align-top">{onReprint && <button type="button" disabled={loading || !!error} onClick={() => onReprint(order)} className="min-h-12 whitespace-nowrap rounded-lg border px-4 font-semibold disabled:opacity-50" aria-label={`Genprint ordre ${order.id}`}>Genprint</button>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {hasMore && onLoadMore && <button type="button" onClick={onLoadMore} disabled={loading || !!error} className="min-h-12 w-full rounded-lg border bg-background px-5 font-semibold disabled:opacity-50">{loading ? 'Henter…' : 'Hent flere ordrer'}</button>}
    <p className="text-xs text-muted-foreground">Datoer og tidspunkter vises i dansk tid. Restaurant vælges øverst på siden.</p>
  </section>;
}
