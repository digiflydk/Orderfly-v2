'use client';

import { useMemo, useState } from 'react';
import Link from '@/components/superadmin/admin-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CustomerOrderRow, CustomerFeedbackRow, CustomerGameRow, CustomerProductRow } from '@/lib/customers/history';

type Filters = { from: string; to: string; merchant: string };
const emptyFilters: Filters = { from: '', to: '', merchant: 'all' };
const money = (value: number) => value.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' }) : '—';
const localDate = (value: string | null) => value ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) : null;
function filtered<T extends { brandId: string; date: string | null }>(rows: T[], filters: Filters) {
  return rows.filter(row => (filters.merchant === 'all' || row.brandId === filters.merchant)
    && (!filters.from || !!localDate(row.date) && localDate(row.date)! >= filters.from)
    && (!filters.to || !!localDate(row.date) && localDate(row.date)! <= filters.to));
}
function HistoryFilters({ filters, setFilters, merchants }: { filters: Filters; setFilters: (value: Filters) => void; merchants: { id: string; name: string }[] }) {
  return <div className="grid gap-3 sm:grid-cols-3">
    <label className="space-y-1 text-sm"><span>From date</span><input aria-label="From date" type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} className="flex h-10 w-full rounded-md border bg-background px-3" /></label>
    <label className="space-y-1 text-sm"><span>To date</span><input aria-label="To date" type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} className="flex h-10 w-full rounded-md border bg-background px-3" /></label>
    <label className="space-y-1 text-sm"><span>Merchant</span><select aria-label="Merchant" value={filters.merchant} onChange={event => setFilters({ ...filters, merchant: event.target.value })} className="flex h-10 w-full rounded-md border bg-background px-3"><option value="all">All merchants</option>{merchants.map(merchant => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></label>
  </div>;
}

export function CustomerHistory({ orders, feedback, feedbackAccess, games, topProducts, merchants }: {
  orders: CustomerOrderRow[]; feedback: CustomerFeedbackRow[]; feedbackAccess: boolean; games: CustomerGameRow[]; topProducts: CustomerProductRow[]; merchants: { id: string; name: string }[];
}) {
  const [orderFilters, setOrderFilters] = useState(emptyFilters);
  const [feedbackFilters, setFeedbackFilters] = useState(emptyFilters);
  const [gameFilters, setGameFilters] = useState(emptyFilters);
  const visibleOrders = useMemo(() => filtered(orders, orderFilters), [orders, orderFilters]);
  const visibleFeedback = useMemo(() => filtered(feedback, feedbackFilters), [feedback, feedbackFilters]);
  const visibleGames = useMemo(() => filtered(games, gameFilters), [games, gameFilters]);
  return <div className="space-y-6">
    <Card><CardHeader><CardTitle>Order History</CardTitle></CardHeader><CardContent className="space-y-4"><HistoryFilters filters={orderFilters} setFilters={setOrderFilters} merchants={merchants} /><p className="text-xs text-muted-foreground">{visibleOrders.length} orders · Amounts include all statuses; only paid, non-cancelled orders count toward purchase totals.</p><div className="max-h-[520px] overflow-auto rounded-md border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-3">Order ID</th><th className="p-3">Date</th><th className="p-3">Merchant</th><th className="p-3">Status</th><th className="p-3">Feedback</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{visibleOrders.map(order => <tr key={`${order.brandId}:${order.id}`} className="border-t"><td className="p-3"><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}`} className="text-primary hover:underline">{order.id}</Link></td><td className="p-3">{dateLabel(order.date)}</td><td className="p-3">{order.merchant}</td><td className="p-3"><Badge>{order.status}</Badge></td><td className="p-3">{order.feedback ? 'Submitted' : '—'}</td><td className="p-3 text-right">{money(order.amount)}</td></tr>)}{!visibleOrders.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No orders match these filters.</td></tr>}</tbody></table></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Feedback History</CardTitle></CardHeader><CardContent className="space-y-4"><HistoryFilters filters={feedbackFilters} setFilters={setFeedbackFilters} merchants={merchants} /><div className="max-h-[420px] overflow-auto rounded-md border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-3">Feedback ID</th><th className="p-3">Date</th><th className="p-3">Merchant</th><th className="p-3">Rating</th><th className="p-3">Comment</th><th className="p-3">Details</th></tr></thead><tbody>{visibleFeedback.map(row => <tr key={`${row.brandId}:${row.id}`} className="border-t"><td className="p-3 font-mono text-xs">{row.id.slice(0, 6).toUpperCase()}</td><td className="p-3">{dateLabel(row.date)}</td><td className="p-3">{row.merchant}</td><td className="p-3">{row.rating === null ? '—' : `${row.rating}/5`}</td><td className="max-w-xs truncate p-3">{row.comment || '—'}</td><td className="p-3"><Link href={`/superadmin/feedback/${encodeURIComponent(row.id)}`} className="text-primary hover:underline">View</Link></td></tr>)}{!visibleFeedback.length && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{feedbackAccess ? 'No feedback matches these filters.' : 'Feedback access is required to view this history.'}</td></tr>}</tbody></table></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Games Participation</CardTitle></CardHeader><CardContent className="space-y-4"><HistoryFilters filters={gameFilters} setFilters={setGameFilters} merchants={merchants} /><div className="max-h-[420px] overflow-auto rounded-md border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-3">Game</th><th className="p-3">Date</th><th className="p-3">Merchant</th><th className="p-3">Newsletter opt-in</th><th className="p-3 text-right">Linked external purchases</th></tr></thead><tbody>{visibleGames.map(game => <tr key={`${game.brandId}:${game.id}`} className="border-t"><td className="p-3">{game.campaign}</td><td className="p-3">{dateLabel(game.date)}</td><td className="p-3">{game.merchant}</td><td className="p-3">{game.optedIn ? 'Yes' : 'No'}</td><td className="p-3 text-right">{game.externalOrders ? `${game.externalOrders} · ${money(game.externalSpend)}` : '—'}</td></tr>)}{!visibleGames.length && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No games match these filters.</td></tr>}</tbody></table></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Top 10 Purchased Dishes</CardTitle></CardHeader><CardContent>{topProducts.length ? <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[500px] text-left text-sm"><thead className="bg-muted"><tr><th className="p-3">#</th><th className="p-3">Dish</th><th className="p-3">Merchant</th><th className="p-3 text-right">Quantity</th></tr></thead><tbody>{topProducts.map((product, index) => <tr key={product.key} className="border-t"><td className="p-3">{index + 1}</td><td className="p-3">{product.name}</td><td className="p-3">{product.merchant}</td><td className="p-3 text-right">{product.quantity}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No paid dishes recorded.</p>}<p className="mt-2 text-xs text-muted-foreground">Quantities come from paid Orderfly orders. External purchases without item details are excluded.</p></CardContent></Card>
  </div>;
}
