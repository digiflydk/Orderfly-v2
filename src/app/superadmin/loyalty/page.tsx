import { redirect } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { adminBrands, loyaltyOverview } from '@/lib/loyalty/stamp-card/admin';
import { filterQuery, parseFilters } from '@/lib/loyalty/stamp-card/filters';
import { CHANNEL_LABELS, EVENT_LABELS, formatDateTime, SOURCE_LABELS } from '@/lib/loyalty/stamp-card/csv';
import { LoyaltyFiltersBar } from '@/components/superadmin/loyalty/loyalty-filters';
import { OverviewCharts } from './overview-charts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const number = (n: number) => n.toLocaleString('da-DK');

export default async function LoyaltyOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/admin-login');
  const db = getAdminDb(), actor = { identity: session.identity, name: session.name }, now = Date.now();
  const brands = await adminBrands(db, actor, 'orderfly.stamp_cards:overview');
  if (!brands.length) {
    // /superadmin/loyalty used to be the customer score; keep old bookmarks working.
    if (session.superuser || session.permissions.includes('orderfly.customer_score:view')) redirect('/superadmin/loyalty/score');
    return <AccessDeniedPage />;
  }
  const filters = parseFilters(await searchParams, now);
  const inCompany = brands.filter(b => !filters.company || b.companyId === filters.company);
  const selected = filters.brands.filter(id => inCompany.some(b => b.brandId === id));
  const brandIds = selected.length ? selected : inCompany.map(b => b.brandId);
  const data = await loyaltyOverview(db, actor, { brandIds, from: filters.from, to: filters.to, channel: filters.channel as 'dine_in' | 'takeaway' | null }, now);
  const query = filterQuery(filters), canSee = (action: string) => session.superuser || session.permissions.includes(`orderfly.stamp_cards:${action}`);
  const { kpi } = data;
  const cards: Array<[string, string, string]> = [
    ['Aktive medlemmer', number(kpi.activeMembers), 'I alt'],
    ['Nye medlemmer', number(kpi.newMembers), 'I perioden'],
    ['Stempler givet', number(kpi.stamps), filters.channel ? `I perioden · ${CHANNEL_LABELS[filters.channel]}` : 'I perioden'],
    ['Belønninger optjent', number(kpi.rewardsEarned), 'I perioden'],
    ['Belønninger indløst', number(kpi.rewardsRedeemed), 'I perioden'],
    ['Optjente, ikke indløste', number(kpi.rewardsOpen), 'Lige nu'],
    ['Kort der udløber', number(kpi.cardsExpiringSoon), 'Inden for 30 dage'],
    ['Nyhedsbrevssamtykke', kpi.newsletterShare === null ? '—' : `${Math.round(kpi.newsletterShare * 100)} %`, 'Andel af aktive medlemmer'],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Loyalitet</h1>
          <p className="text-muted-foreground">Overblik over stempelkortet. Alle tal følger filtrene.</p>
        </div>
        <ul aria-label="Programstatus" className="flex flex-wrap gap-2">
          {data.programs.map(p => (
            <li key={p.brandId}><Badge variant={p.active ? 'default' : 'outline'}>{p.name} · {p.active ? 'Aktivt' : 'Ikke aktivt'}{data.programs.length > 1 ? ` · ${p.brandName}` : ''}</Badge></li>
          ))}
        </ul>
      </div>
      <LoyaltyFiltersBar filters={filters} brands={brands} />
      {data.truncated && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm">Perioden har flere end 20.000 hændelser pr. brand. Vælg en kortere periode for præcise tal.</p>}

      <section aria-label="Nøgletal" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, hint]) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{hint}</p></CardContent>
          </Card>
        ))}
      </section>

      <OverviewCharts daily={data.daily} channels={data.channels} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Seneste aktivitet</h2>
            {canSee('log') && <Link className="text-sm underline-offset-2 hover:underline" href={`/superadmin/loyalty/stamp-card?${query}&tab=log`}>Se hele loggen</Link>}
          </div>
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Tidspunkt</TableHead><TableHead>Hændelse</TableHead><TableHead>Medlem</TableHead><TableHead>Medarbejder · kilde</TableHead></TableRow></TableHeader>
            <TableBody>{data.latest.map((e, i) => (
              <TableRow key={i}><TableCell className="whitespace-nowrap">{formatDateTime(e.createdAt)}</TableCell><TableCell>{EVENT_LABELS[e.type] ?? e.type}{e.quantity > 1 ? ` (${e.quantity})` : ''}</TableCell>
                <TableCell>{e.memberName || '—'}</TableCell><TableCell>{[e.actorName, SOURCE_LABELS[e.source] ?? e.source].filter(Boolean).join(' · ')}</TableCell></TableRow>
            ))}</TableBody>
          </Table>{!data.latest.length && <p className="py-6 text-center text-sm text-muted-foreground">Ingen aktivitet endnu.</p>}</div>
        </section>
        <section className="space-y-3 rounded-lg border bg-white p-4">
          <h2 className="font-semibold">Stempler og indløsninger pr. medarbejder</h2>
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow><TableHead>Medarbejder</TableHead><TableHead className="text-right">Stempler</TableHead><TableHead className="text-right">Indløsninger</TableHead></TableRow></TableHeader>
            <TableBody>{data.staff.map((s, i) => (
              <TableRow key={i}><TableCell>{s.name}</TableCell><TableCell className="text-right">{number(s.stamps)}</TableCell><TableCell className="text-right">{number(s.redemptions)}</TableCell></TableRow>
            ))}</TableBody>
          </Table>{!data.staff.length && <p className="py-6 text-center text-sm text-muted-foreground">Ingen registreringer i perioden.</p>}</div>
        </section>
      </div>

      <nav aria-label="Genveje" className="flex flex-wrap gap-2">
        {canSee('settings') && <Link className="rounded-md border bg-white px-4 py-2 text-sm font-medium" href={`/superadmin/loyalty/stamp-card?${query}&tab=settings`}>Stempelkort-indstillinger</Link>}
        {canSee('members') && <Link className="rounded-md border bg-white px-4 py-2 text-sm font-medium" href={`/superadmin/loyalty/stamp-card?${query}&tab=members`}>Medlemsliste</Link>}
        {canSee('log') && <Link className="rounded-md border bg-white px-4 py-2 text-sm font-medium" href={`/superadmin/loyalty/stamp-card?${query}&tab=log`}>Log</Link>}
      </nav>
    </div>
  );
}
