'use client';
import { useKdsLanguage } from './kds-language';

import { Eye, Printer } from 'lucide-react';
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
  const {t, language} = useKdsLanguage();
  const groups = new Map<string, TerminalOrder[]>();
  for (const order of sortTerminalPreorders(orders)) {
    const day = terminalDay(order.fulfillmentAt) || 'unknown';
    groups.set(day, [...(groups.get(day) || []), order]);
  }
  return <section aria-label={t("Forudbestillinger")} aria-busy={loading} className="min-w-0 space-y-5">
    <div><h2 className="text-2xl font-semibold">{' '}{t("Forudbestillinger")}{' '}</h2><p className="mt-1 text-sm text-muted-foreground">{' '}{t("Planlagte ordrer, som endnu ikke er frigivet til køkkenet.")}{' '}</p></div>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"><span>{error} {' '}{t("Tidligere viste data kan være forældede.")}{' '}</span>{onRetry && <button type="button" disabled={loading} onClick={onRetry} className="min-h-12 rounded-lg border border-red-300 px-4 font-semibold">{' '}{t("Prøv igen")}{' '}</button>}</div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">{' '}{t("Henter forudbestillinger…")}{' '}</p>}
    {!orders.length && !loading && !error && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{hasMore ? t("Ingen forudbestillinger i denne del. Hent flere for at fortsætte.") : t("Ingen ventende forudbestillinger.")}</p>}
    {[...groups.entries()].map(([day, dayOrders]) => <section key={day} aria-label={terminalDateHeading(dayOrders[0].fulfillmentAt, language)} className="space-y-3">
      <h3 className="text-lg font-semibold capitalize">{terminalDateHeading(dayOrders[0].fulfillmentAt, language)} <span className="ml-1 text-sm font-normal text-muted-foreground">({dayOrders.length})</span></h3>
      <div className="overflow-x-auto rounded-xl border bg-background"><table className="w-full whitespace-nowrap text-left text-sm">
        <caption className="sr-only">{t("Forudbestillinger")} · {terminalDateHeading(dayOrders[0].fulfillmentAt, language)}</caption>
        <thead className="bg-slate-50 text-slate-500"><tr>{[t("Klar til"), t("Ordre / kunde"), t("Type"), t("Beløb"), 'Status', t("Handlinger")].map(label => <th key={label} scope="col" className="p-4">{label}</th>)}</tr></thead>
        <tbody className="divide-y">{dayOrders.map(order => <tr key={order.id} aria-label={`${t("Forudbestilling")} ${order.id}`}>
          <td className="p-4 font-semibold">{terminalDateTime(order.fulfillmentAt, language)}</td>
          <td className="p-4"><span className="font-semibold">{order.id.replace(/^ORD[-\s]*/i, '')}</span> / {order.customerName || t("Kunde")}</td>
          <td className="p-4">{order.deliveryType === 'Pickup' ? t("Afhentning") : t("Levering")}</td>
          <td className="p-4 font-semibold">{formatPrice(order.totalAmount)}</td>
          <td className="p-4">{t(ORDER_STATUS_LABELS[order.status])} / {order.paymentStatus === 'Paid' ? t("Betalt") : order.paymentStatus === 'Failed' ? t("Betaling fejlet") : t("Ikke betalt")}</td>
          <td className="p-4"><div className="flex gap-2"><button type="button" onClick={() => onSelectOrder(order)} aria-label={`${t("Vis ordre")} ${order.id}`} title={t("Vis ordre")} className="min-h-12 min-w-12 rounded-lg border p-3"><Eye aria-hidden="true" className="h-5 w-5" /></button>{onReprint && <button type="button" disabled={loading || !!error} onClick={() => onReprint(order)} aria-label={`${t("Genprint ordre")} ${order.id}`} title={t("Genprint")} className="min-h-12 min-w-12 rounded-lg border p-3 disabled:opacity-50"><Printer aria-hidden="true" className="h-5 w-5" /></button>}</div></td>
        </tr>)}</tbody>
      </table></div>
    </section>)}
    {hasMore && onLoadMore && <button type="button" onClick={onLoadMore} disabled={loading || !!error} className="min-h-12 w-full rounded-lg border bg-background px-5 font-semibold disabled:opacity-50">{loading ? t("Henter…") : t("Hent flere forudbestillinger")}</button>}
    <p className="text-xs text-muted-foreground">{' '}{t("Tidspunkter vises i dansk tid. Visning af en ordre ændrer ikke dens status.")}{' '}</p>
  </section>;
}
