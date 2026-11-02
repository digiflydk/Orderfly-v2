import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DullyPurchaseSummary, DullyPurchaseView } from '@/lib/customers/dully-purchases-server';

const time = (value: string | null) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
};
const dkk = (value: number) => value.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });
const statusText = (p: DullyPurchaseView) => p.paymentStatus === 'refunded' ? 'Refunderet' : p.status === 'completed' && p.paymentStatus === 'paid' ? 'Gennemført' : p.status === 'cancelled' ? 'Annulleret' : 'Ikke gennemført';

/** Dully webshop purchases: customer/retention analysis only, never Orderfly orders or loyalty. */
export function DullyPurchases({ purchases, summary }: { purchases: DullyPurchaseView[]; summary: DullyPurchaseSummary }) {
  if (!purchases.length) return null;
  const facts: Array<[string, string]> = [
    ['Gennemførte køb', String(summary.count)], ['Beløb', dkk(summary.amount)],
    ['Første køb', time(summary.firstPurchaseAt)], ['Seneste køb', time(summary.lastPurchaseAt)],
    ['Dage siden seneste køb', summary.daysSinceLast === null ? '–' : String(summary.daysSinceLast)],
    ['Gns. dage mellem køb', summary.averageDaysBetween === null ? '–' : String(summary.averageDaysBetween)],
  ];
  return <Card data-testid="dully-purchases"><CardHeader><CardTitle>Dully-køb (webshop)</CardTitle><p className="text-sm text-muted-foreground">Kun til kunde- og retentionanalyse. Indgår ikke i Orderfly-ordrer, omsætning eller loyalitet.</p></CardHeader>
    <CardContent className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{facts.map(([name, value]) => <div key={name} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{name}</dt><dd className="mt-1 text-sm font-semibold">{value}</dd></div>)}</dl>
      <ul className="space-y-3">{purchases.map(p => <li key={p.id} className="space-y-1 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong>#{p.orderNumber} · {p.experienceType === 'delivery' ? 'Levering' : 'Afhentning'}</strong><span>{dkk(p.orderTotal)}{p.refundedAmount > 0 ? ` (refunderet ${dkk(p.refundedAmount)})` : ''}</span></div>
        <p className="text-xs text-muted-foreground">Bestilt {time(p.orderedAt)}{p.completedAt ? ` · gennemført ${time(p.completedAt)}` : ''} · {statusText(p)}</p>
        {p.orderLines.length > 0 && <p className="break-words text-xs">{p.orderLines.map(l => `${l.quantity} × ${l.name}`).join(', ')}</p>}
      </li>)}</ul>
    </CardContent></Card>;
}
