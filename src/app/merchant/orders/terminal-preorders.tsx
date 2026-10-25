'use client';

import type { TerminalOrder } from '@/lib/orders/terminal-types';
import { ORDER_STATUS_LABELS } from '@/lib/orders/presentation';
import { formatPrice } from '@/lib/storefront-format';
import { sortTerminalPreorders, terminalDateHeading, terminalDateTime, terminalDay } from './terminal-filters';

export type TerminalPreordersProps = {
  orders: TerminalOrder[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSelectOrder: (order: TerminalOrder) => void;
  onReprint?: (order: TerminalOrder) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  serverTime?: string;
};

export function TerminalPreorders({ orders, loading = false, error, onRetry, onSelectOrder, onReprint, hasMore, onLoadMore }: TerminalPreordersProps) {
  const groups = new Map<string, TerminalOrder[]>();
  for (const order of sortTerminalPreorders(orders)) {
    const day = terminalDay(order.fulfillmentAt) || 'unknown';
    groups.set(day, [...(groups.get(day) || []), order]);
  }
  return <section aria-label="Forudbestillinger" aria-busy={loading} className="min-w-0 space-y-5">
    <div><h2 className="text-2xl font-semibold">Forudbestillinger</h2><p className="mt-1 text-sm text-muted-foreground">Ordrer til kommende dage. Senere i dag vises under Ordrer med det aftalte tidspunkt.</p></div>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><span>{error} Tidligere viste data kan være forældede.</span>{onRetry && <button type="button" disabled={loading} onClick={onRetry} className="min-h-12 rounded-lg border border-red-300 px-4 font-semibold">Prøv igen</button>}</div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Henter forudbestillinger…</p>}
    {!orders.length && !loading && !error && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{hasMore ? 'Ingen forudbestillinger i denne del. Hent flere for at fortsætte.' : 'Ingen forudbestillinger til kommende dage.'}</p>}
    {[...groups.entries()].map(([day, dayOrders]) => <section key={day} aria-label={terminalDateHeading(dayOrders[0].fulfillmentAt)} className="space-y-3">
      <h3 className="text-lg font-semibold capitalize">{terminalDateHeading(dayOrders[0].fulfillmentAt)} <span className="ml-1 text-sm font-normal text-muted-foreground">({dayOrders.length})</span></h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dayOrders.map(order => <article key={order.id} aria-label={`Forudbestilling ${order.id}`} className="min-w-0 rounded-xl border bg-background p-4">
        <div className="flex items-start justify-between gap-3"><button type="button" onClick={() => onSelectOrder(order)} className="min-h-12 break-all text-left font-semibold underline underline-offset-4" aria-label={`Vis ordre ${order.id}`}>{order.id}</button><span className="shrink-0 pt-3 font-semibold">{formatPrice(order.totalAmount)}</span></div>
        <p className="break-words font-medium">{order.customerName || 'Kunde'}</p><p className="mt-1 text-sm text-muted-foreground">{order.locationName || order.brandName}</p>
        <p className="mt-4 font-semibold">{order.deliveryType === 'Pickup' ? 'Afhentning' : 'Levering'}: {terminalDateTime(order.fulfillmentAt)}</p>
        <p className="mt-2 text-sm">{ORDER_STATUS_LABELS[order.status]} · {order.paymentStatus === 'Paid' ? 'Betalt' : 'Ikke betalt'}</p>
        {onReprint && <button type="button" disabled={loading || !!error} onClick={() => onReprint(order)} className="mt-4 min-h-12 w-full rounded-lg border px-4 font-semibold disabled:opacity-50" aria-label={`Genprint ordre ${order.id}`}>Genprint</button>}
      </article>)}</div>
    </section>)}
    {hasMore && onLoadMore && <button type="button" onClick={onLoadMore} disabled={loading || !!error} className="min-h-12 w-full rounded-lg border bg-background px-5 font-semibold disabled:opacity-50">{loading ? 'Henter…' : 'Hent flere forudbestillinger'}</button>}
    <p className="text-xs text-muted-foreground">Tidspunkter vises i dansk tid. Visning af en ordre ændrer ikke dens status.</p>
  </section>;
}
