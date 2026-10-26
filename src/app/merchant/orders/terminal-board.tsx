'use client';
import type { TerminalOrder } from '@/lib/orders/terminal-types';
import { formatPrice } from '@/lib/storefront-format';

export function terminalTime(order: TerminalOrder) {
  const date = order.fulfillmentAt ? new Date(order.fulfillmentAt) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Copenhagen' }).format(date) : order.deliveryTime || 'Tid ikke angivet';
}
const columns = [
  { status: 'Received', name: 'Nye ordrer', dot: 'bg-blue-600', border: 'border-t-blue-600', empty: 'Ingen nye ordrer' },
  { status: 'In Progress', name: 'Tilberedes', dot: 'bg-amber-500', border: 'border-t-amber-500', empty: 'Ingen ordrer under tilberedning' },
  { status: 'Ready', name: 'Klar til afhentning', dot: 'bg-emerald-600', border: 'border-t-emerald-600', empty: 'Ingen færdige ordrer' },
] as const;
export function TerminalBoard({ orders, onSelectOrder, loading, hasMore, onLoadMore }: {
  orders: TerminalOrder[]; onSelectOrder: (order: TerminalOrder) => void; loading?: boolean; hasMore?: boolean; onLoadMore?: () => void;
}) {
  return <div className="space-y-4"><div className="grid gap-4 lg:grid-cols-3">
    {columns.map(column => {
      const rows = orders.filter(order => order.status === column.status && !(order.managedDelivery && order.managedDeliveryTracking?.deliveryStatus === 'delivered')).sort((a, b) => (a.fulfillmentAt || a.createdAt || '').localeCompare(b.fulfillmentAt || b.createdAt || ''));
      return <section key={column.status} aria-label={column.name} className={`min-w-0 rounded-2xl border border-t-4 bg-slate-50 p-3 ${column.border}`}>
        <h2 className="mb-4 flex items-center gap-2 px-1 text-lg font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} aria-hidden="true" />{column.name}<span className="ml-auto rounded-full bg-white px-3 py-1 text-sm tabular-nums">{rows.length}</span></h2>
        <div className="space-y-3">{rows.map(order => <button key={order.id} onClick={() => onSelectOrder(order)} aria-label={`Åbn ordre ${order.id}`} className="block w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <div className="flex flex-wrap items-start justify-between gap-2"><strong className="break-all text-lg">{order.id}</strong><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-lg font-bold tabular-nums">{terminalTime(order)}</span></div>
          <p className="mt-1 break-words font-medium">{order.customerName || 'Kunde'}</p>
          <p className="mt-1 text-sm text-slate-600">{order.deliveryType === 'Delivery' ? 'Levering' : 'Afhentning'} · {order.locationName}</p>
          <ul className="my-3 space-y-1 border-y py-3 text-sm">{order.items.slice(0, 4).map((item, index) => <li key={index} className="flex gap-2"><strong className="min-w-5">{item.quantity}×</strong><span className="break-words">{item.name}{item.modifiers.length > 0 && <span className="block text-slate-600">{item.modifiers.join(' · ')}</span>}</span></li>)}{order.items.length > 4 && <li className="text-slate-600">+ {order.items.length - 4} flere varelinjer</li>}</ul>
          {order.notes && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm font-medium">Bemærkning: {order.notes}</p>}
          <div className="flex flex-wrap justify-between gap-2 text-sm"><span className={order.paymentStatus === 'Paid' ? 'text-emerald-800' : 'font-semibold text-amber-900'}>{order.paymentStatus === 'Paid' ? 'Betalt' : 'Betaling mangler'}</span><strong>{formatPrice(order.totalAmount)}</strong></div>
          <span className="mt-3 block text-sm font-semibold text-blue-700">Se ordre og handlinger →</span>
        </button>)}</div>
        {!rows.length && <p className="py-12 text-center text-sm text-slate-500">{loading ? 'Henter ordrer…' : column.empty}</p>}
      </section>;
    })}
  </div>{hasMore && <div className="rounded-xl border bg-amber-50 p-4"><p>Der er flere ordrer. Tallene viser de indlæste ordrer.</p><button className="mt-2 min-h-12 rounded-lg border bg-white px-5 font-semibold" onClick={onLoadMore} disabled={loading}>Hent flere ordrer</button></div>}</div>;
}
