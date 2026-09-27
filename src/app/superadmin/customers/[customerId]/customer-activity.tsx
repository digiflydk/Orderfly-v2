import Link from '@/components/superadmin/admin-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminDb } from '@/lib/firebase-admin';
import { asDate } from '@/lib/loyalty/model';
import type { DirectoryEntry } from '@/lib/customers/directory';

export async function CustomerActivity({ entry }: { entry?: DirectoryEntry }) {
  if (!entry) return <Card><CardHeader><CardTitle>Games and purchases by merchant</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">No linked game activity. Orders for this customer record are shown above.</CardContent></Card>;

  const db = getAdminDb();
  const [brands, orderSnapshots] = await Promise.all([
    Promise.all(entry.brandIds.map(id => db.collection('brands').doc(id).get())),
    Promise.all(entry.sources.filter(source => source.kind === 'customer').map(source =>
      db.collection('orders').where('brandId', '==', source.brandId).where('customerDetails.id', '==', source.id).get())),
  ]);
  const brandNames = new Map(brands.map(brand => [brand.id, String(brand.data()?.name || brand.id)]));
  const orders = orderSnapshots.flatMap(snapshot => snapshot.docs.map(doc => ({
    id: doc.id, brandId: String(doc.data().brandId || ''),
    status: String(doc.data().status || ''), amount: Number(doc.data().totalAmount || 0),
    date: asDate(doc.data().createdAt)?.toISOString() || '',
  }))).sort((a, b) => b.date.localeCompare(a.date));
  const money = (amount: number) => amount.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' });

  return <Card>
    <CardHeader><CardTitle>Games and purchases by merchant</CardTitle><p className="text-sm text-muted-foreground">Records with the same email are shown together as a possible match. Verify identity before using information across merchants.</p></CardHeader>
    <CardContent className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">{entry.brandIds.map(brandId => {
        const customerRecords = entry.sources.filter(source => source.brandId === brandId && source.kind === 'customer');
        const games = entry.sources.filter(source => source.brandId === brandId && source.kind === 'game');
        const purchaseCount = customerRecords.reduce((sum, source) => sum + (source.totalOrders || 0), 0) + games.reduce((sum, source) => sum + (source.externalOrders || 0), 0);
        const spend = customerRecords.reduce((sum, source) => sum + (source.totalSpend || 0), 0) + games.reduce((sum, source) => sum + (source.externalSpend || 0), 0);
        return <section key={brandId} className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">{brandNames.get(brandId)}</h3>
          <p className="text-sm">Purchases: {purchaseCount} · {money(spend)}</p>
          <div className="text-sm"><p className="font-medium">Games played: {games.length}</p>{games.length ? <ul className="mt-1 space-y-1">{games.map(game => <li key={game.id}>{game.campaignName || 'Scratch card'} · {game.date ? new Date(game.date).toLocaleDateString('da-DK') : 'Date unknown'}{game.externalOrders ? ` · External purchases: ${game.externalOrders} (${money(game.externalSpend || 0)})` : ''}</li>)}</ul> : <p className="text-muted-foreground">No games recorded.</p>}</div>
        </section>;
      })}</div>
      <div><h3 className="mb-2 font-semibold">Orderfly orders by merchant</h3><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-muted/40"><tr><th className="p-3">Date</th><th className="p-3">Merchant</th><th className="p-3">Order</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{orders.map(order => <tr key={order.id} className="border-t"><td className="p-3">{order.date ? new Date(order.date).toLocaleDateString('da-DK') : '—'}</td><td className="p-3">{brandNames.get(order.brandId)}</td><td className="p-3"><Link href={`/superadmin/sales/orders/${encodeURIComponent(order.id)}`} className="underline">{order.id}</Link></td><td className="p-3">{order.status}</td><td className="p-3 text-right">{money(order.amount)}</td></tr>)}{!orders.length && <tr><td colSpan={5} className="p-5 text-center text-muted-foreground">No Orderfly orders yet.</td></tr>}</tbody></table></div><p className="mt-2 text-xs text-muted-foreground">Purchase totals include paid external Games sales tied to a specific play. Orders above list Orderfly orders only.</p></div>
    </CardContent>
  </Card>;
}
