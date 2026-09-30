'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { OrderPaymentActions } from '@/components/superadmin/order-payment-actions';
import { paymentMethodLabel } from '@/lib/merchant-payment-methods';
import { isPaidSale } from '@/lib/paid-order';
import { formatPrice } from '@/lib/storefront-format';
import type { OrderDetail, OrderStatus } from '@/types';

export type MerchantOrderRow = { id: string; customerName: string; locationName: string; createdAt: string;
  totalAmount: number; status: OrderStatus; paymentStatus: string; paymentMethod: string; paymentCollection?: OrderDetail['paymentCollection'] };
const statusNames: Record<OrderStatus, string> = { Pending: 'Afventer betaling', Received: 'Modtaget', 'In Progress': 'Tilberedes', Ready: 'Klar', Completed: 'Afsluttet', Delivered: 'Leveret', Canceled: 'Annulleret', Error: 'Kontakt restauranten' };
export function MerchantOrders({ orders, canEdit }: { orders: MerchantOrderRow[]; canEdit: boolean }) {
  const router = useRouter(), [search, setSearch] = useState('');
  useEffect(() => { const timer = setInterval(() => router.refresh(), 20000); return () => clearInterval(timer); }, [router]);
  const paid = orders.filter(isPaidSale), visible = orders.filter(order => `${order.id} ${order.customerName} ${order.locationName}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-6"><h1 className="text-2xl font-bold">Ordrer</h1>
    <div className="flex flex-wrap gap-5 rounded-lg border p-4"><p>Betalte ordrer: <strong>{paid.length}</strong></p><p>Betalt omsætning: <strong>{formatPrice(paid.reduce((sum, order) => sum + order.totalAmount, 0))}</strong></p>
      <p>Betales ved afhentning: <strong>{orders.filter(order => order.paymentMethod === 'PayAtPickup' && order.paymentStatus === 'Pending' && order.status !== 'Pending' && order.status !== 'Canceled').length}</strong></p></div>
    <label className="block">Søg ordre eller kunde<input value={search} onChange={event => setSearch(event.target.value)} className="mt-2 block h-11 w-full max-w-md rounded-md border bg-background px-3" /></label>
    <div className="space-y-4">{visible.map(order => <article key={order.id} aria-label={`Ordre ${order.id}`} className="rounded-lg border p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3"><div><Link href={`/superadmin/sales/orders/${order.id}`} className="font-semibold underline">{order.id}</Link><p>{order.customerName} · {order.locationName}</p><p className="text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}</p></div>
        <div className="text-right"><p className="font-bold">{formatPrice(order.totalAmount)}</p><p>{statusNames[order.status]}</p></div></div>
      <p className={order.paymentMethod === 'PayAtPickup' && order.paymentStatus === 'Pending' ? 'font-semibold text-amber-800' : ''}>{order.status === 'Canceled' ? 'Annulleret' : paymentMethodLabel(order)}{order.paymentStatus === 'Pending' && order.paymentMethod !== 'PayAtPickup' ? ' · Afventer betaling' : ''}</p>
      {order.paymentCollection && <p className="text-sm">Modtaget {new Date(order.paymentCollection.receivedAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })} af {order.paymentCollection.employeeName || order.paymentCollection.employeeId}.</p>}
      <OrderPaymentActions orderId={order.id} paymentMethod={order.paymentMethod} paymentStatus={order.paymentStatus} status={order.status} canEdit={canEdit} />
    </article>)}{!visible.length && <p>Ingen ordrer fundet.</p>}</div>
  </div>;
}
