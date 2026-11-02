import Link from '@/components/superadmin/admin-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/ui/empty-state';
import { getBrands } from '@/app/superadmin/brands/actions';
import { isAdminReady } from '@/lib/runtime';
import { retentionBrandIds, retentionForBrand } from '@/lib/customers/retention-server';
import { COHORT_MONTHS } from '@/lib/customers/retention';

export const dynamic = 'force-dynamic';
const dkk = (v: number) => v.toLocaleString('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString('da-DK');

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}</div>;
}

export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  if (!isAdminReady()) return <EmptyState title="Admin Environment Not Configured" hint="This page requires Firebase Admin credentials." />;
  const [{ brand }, { brandIds }, brands] = await Promise.all([searchParams, retentionBrandIds(), getBrands()]);
  const options = brands.filter(b => brandIds.includes(b.id)).map(b => ({ id: b.id, name: b.name }));
  if (!options.length) return <EmptyState title="Ingen adgang" hint="Retention kræver adgang til hele kundebasen for mindst ét brand." />;
  const selected = options.find(o => o.id === brand) || options[0];
  const data = await retentionForBrand(selected.id);
  if (!data) return <EmptyState title="Ingen adgang" hint="Du har ikke adgang til kundebasen for dette brand." />;
  const r = data.report;
  return <div className="space-y-6">
    <div className="space-y-2">
      <Link href="/superadmin/customers" className="text-sm underline">Tilbage til kunder</Link>
      <h1 className="text-2xl font-bold tracking-tight">Retention og genkøb</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Betalte Orderfly-ordrer og gennemførte Dully-webshopkøb pr. kunde for det valgte brand. Dully-køb bruges kun her og på kunden; de indgår ikke i Orderfly-omsætning, ordrer eller loyalitet. Tider er dansk tid.</p>
      <form className="flex flex-wrap items-end gap-2"><label className="space-y-1 text-sm"><span className="block text-xs text-muted-foreground">Brand</span>
        <select name="brand" defaultValue={selected.id} className="h-10 min-w-48 rounded-md border bg-background px-3 text-sm">{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <button className="h-10 rounded-md border px-4 text-sm font-medium">Vis</button></form>
    </div>
    <section aria-label="Nøgletal" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Tile label="Kunder med køb" value={num(r.buyers)} note={`af ${num(data.customers)} kunderecords`} />
      <Tile label="Genkøbsrate" value={`${r.repeatRate.toLocaleString('da-DK')} %`} note={`${num(r.repeatBuyers)} kunder med 2+ køb`} />
      <Tile label="Køb pr. kunde" value={r.purchasesPerBuyer.toLocaleString('da-DK')} note={`${num(r.purchases)} køb · ${dkk(r.amount)}`} />
      <Tile label="Median dage mellem køb" value={r.medianDaysBetween === null ? '–' : num(r.medianDaysBetween)} />
      <Tile label="Aktive seneste 30/60/90 dage" value={`${num(r.active.d30)} / ${num(r.active.d60)} / ${num(r.active.d90)}`} />
      <Tile label="Ikke købt i 90+ dage" value={num(r.lapsed90)} />
    </section>
    <Card><CardHeader><CardTitle>Kilder</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3">
      <p><strong className="tabular-nums">{num(r.bySource.orderflyOnly)}</strong> kunder kun Orderfly · {num(r.bySource.orderflyPurchases)} køb · {dkk(r.bySource.orderflyAmount)}</p>
      <p><strong className="tabular-nums">{num(r.bySource.dullyOnly)}</strong> kunder kun Dully · {num(r.bySource.dullyPurchases)} køb · {dkk(r.bySource.dullyAmount)}</p>
      <p><strong className="tabular-nums">{num(r.bySource.both)}</strong> kunder har købt via begge</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Månedlige kohorter</CardTitle><p className="text-sm text-muted-foreground">Kunder grupperet efter måneden for første køb. Procent = andel, der købte igen i den angivne måned efter første køb.</p></CardHeader>
      <CardContent className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm tabular-nums" data-testid="retention-cohorts">
        <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Første køb</th><th className="py-2 pr-3 text-right font-medium">Kunder</th>{Array.from({ length: COHORT_MONTHS }, (_, i) => <th key={i} className="py-2 pr-3 text-right font-medium">+{i + 1} md.</th>)}</tr></thead>
        <tbody>{r.cohorts.map(c => <tr key={c.month} className="border-b last:border-0"><td className="py-2 pr-3">{c.month}</td><td className="py-2 pr-3 text-right">{num(c.size)}</td>{c.retained.map((v, i) => <td key={i} className="py-2 pr-3 text-right">{v === null ? '' : `${v.toLocaleString('da-DK')} %`}</td>)}</tr>)}</tbody>
      </table>{!r.cohorts.length && <p className="text-sm text-muted-foreground">Ingen køb endnu.</p>}</CardContent></Card>
  </div>;
}
