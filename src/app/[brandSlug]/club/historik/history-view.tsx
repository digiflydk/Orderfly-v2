import type { PortalOrder } from '@/lib/loyalty/stamp-card/order-history';
import type { PortalMember } from '../data';
import { danishDate, historyText } from '../texts';

// Pure presentation shared by the authenticated page and isolated browser QA.
const money = (value: number) => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(value);
const statusText: Record<string, string> = { Received: 'Modtaget', 'In Progress': 'Under tilberedning', Ready: 'Klar', Completed: 'Afsluttet', Delivered: 'Leveret' };

export function HistoryView({ history, orders = [] }: { history: PortalMember['history']; orders?: PortalOrder[] }) {
  return (
    <section aria-labelledby="club-history" className="club-member-history flex flex-col gap-4">
      <h1 id="club-history" className="text-center text-3xl">Historik</h1>
      <h2 className="text-xl">Onlinekøb</h2>
      <p className="text-sm">Dine seneste 100 betalte onlineordrer. Annullerede og ubetalte ordrer vises ikke.</p>
      {orders.length === 0 ? <p>Du har ingen betalte onlineordrer endnu.</p> : <ul aria-label="Onlinekøb" className="flex flex-col divide-y rounded-xl border">
        {orders.map(order => <li key={order.id} className="flex items-baseline justify-between gap-3 p-4">
          <span className="flex flex-col"><span className="font-semibold">Ordre {order.id}</span><span>{order.locationName} · {statusText[order.status] || 'Betalt'}</span>
            <span>{money(order.netAmount)}{order.refundedAmount > 0 && ` (refunderet ${money(order.refundedAmount)} af ${money(order.totalAmount)})`}</span></span>
          <time dateTime={new Date(order.orderedAt).toISOString()} className="shrink-0 text-sm">{danishDate(order.orderedAt)}</time>
        </li>)}
      </ul>}
      <h2 className="text-xl">Stempler og belønninger</h2>
      {history.length === 0
        ? <p className="text-center">Du har ingen stempler eller belønninger endnu.</p>
        : (
          <ul className="flex flex-col divide-y rounded-xl border">
            {history.map((event, index) => {
              const { label, channel } = historyText(event);
              return (
                <li key={index} className="flex items-baseline justify-between gap-3 p-4">
                  <span className="flex flex-col">
                    <span className="font-semibold">{label}</span>
                    {channel && <span className="text-sm">{channel}</span>}
                  </span>
                  <time dateTime={new Date(event.createdAt).toISOString()} className="shrink-0 text-sm">{danishDate(event.createdAt)}</time>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}
