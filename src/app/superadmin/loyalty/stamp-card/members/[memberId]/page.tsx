import { notFound, redirect } from 'next/navigation';
import Link from '@/components/superadmin/admin-link';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { memberDetail } from '@/lib/loyalty/stamp-card/admin';
import { LoyaltyError } from '@/lib/loyalty/stamp-card/counter';
import { CHANNEL_LABELS, EVENT_LABELS, formatDate, formatDateTime, formatKr, SOURCE_LABELS } from '@/lib/loyalty/stamp-card/csv';
import { CorrectionPanel } from './correction-panel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REWARD_STATUS: Record<string, string> = { available: 'Klar til indløsning', redeemed: 'Indløst', expired: 'Udløbet', cancelled: 'Annulleret' };

export default async function MemberPage({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await orderflySession().catch(() => null);
  if (!session) redirect('/admin-login');
  const { memberId } = await params, query = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => typeof v === 'string' ? [[k, v]] : []));
  query.set('tab', 'members');
  let detail;
  try { detail = await memberDetail(getAdminDb(), { identity: session.identity, name: session.name }, memberId, Date.now()); }
  catch (error) {
    if (error instanceof LoyaltyError && error.status === 404) notFound();
    if (error instanceof LoyaltyError && error.status === 403) return <AccessDeniedPage />;
    throw error;
  }
  const { member, card, rewards, events, correctLocations, brand } = detail;
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/superadmin/loyalty/stamp-card?${query}`} className="text-sm underline-offset-2 hover:underline">← Medlemmer</Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{member.name}</h1>
        <p className="text-muted-foreground">{member.email} · {brand.brandName} · tilmeldt {formatDate(member.joinedAt)}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm font-medium">Stempler</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{card.stamps} af {card.stampsRequired}</p>
            <p className="text-sm text-muted-foreground">{card.expiresAt ? `Udløber ${formatDate(card.expiresAt)}` : 'Ingen aktive stempler'}{card.locationName ? ` · gælder i ${card.locationName}` : ''}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">Optjente belønninger</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{rewards.filter(r => r.status === 'available').length}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm font-medium">Nyhedsbrev</CardTitle></CardHeader>
          <CardContent><Badge variant={member.consent?.status === 'given' ? 'default' : 'outline'}>{member.consent?.status === 'given' ? 'Tilmeldt' : 'Afmeldt'}</Badge>
            <p className="mt-2 text-sm text-muted-foreground">{member.consent ? `${formatDateTime(member.consent.at)} · ${member.consent.source === 'omnisend' ? 'via Omnisend' : 'via kundeportalen'}${member.consent.version ? ` · tekstversion ${member.consent.version}` : ''}` : ''}</p></CardContent></Card>
      </div>

      {correctLocations.length > 0 && <CorrectionPanel brandId={brand.brandId} memberId={member.id} locations={correctLocations}
        redeemedRewards={rewards.filter(r => r.status === 'redeemed').map(r => ({ id: r.id, description: r.description, redeemedAt: r.redeemedAt }))} />}

      <section className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Belønninger</h2>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Belønning</TableHead><TableHead>Optjent</TableHead><TableHead>Udløber</TableHead><TableHead>Status</TableHead><TableHead>Indløst</TableHead></TableRow></TableHeader>
          <TableBody>{rewards.map(r => (
            <TableRow key={r.id}><TableCell>{r.description}</TableCell><TableCell>{formatDate(r.earnedAt)}</TableCell><TableCell>{formatDate(r.expiresAt)}</TableCell>
              <TableCell>{REWARD_STATUS[r.status] ?? r.status}</TableCell>
              <TableCell>{r.redeemedAt ? `${formatDateTime(r.redeemedAt)} · ${r.redeemedByName ?? ''}${r.redeemedLocationName ? ` · ${r.redeemedLocationName}` : ''}` : '—'}</TableCell></TableRow>
          ))}</TableBody>
        </Table>{!rewards.length && <p className="py-6 text-center text-sm text-muted-foreground">Ingen belønninger endnu.</p>}</div>
      </section>

      <section className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="font-semibold">Historik</h2>
        {detail.eventsTruncated && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm">Viser de seneste 500 hændelser. Ældre hændelser findes i loggen og dens CSV-eksport.</p>}
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Tidspunkt</TableHead><TableHead>Hændelse</TableHead><TableHead>Antal · beløb</TableHead><TableHead>Kanal · kilde</TableHead><TableHead>Afdeling</TableHead><TableHead>Medarbejder</TableHead><TableHead>Årsag</TableHead></TableRow></TableHeader>
          <TableBody>{events.map((e, i) => (
            <TableRow key={i}><TableCell className="whitespace-nowrap">{formatDateTime(e.createdAt)}</TableCell><TableCell>{EVENT_LABELS[e.type] ?? e.type}</TableCell>
              <TableCell>{e.quantity || '—'}{e.amountOre != null ? ` · ${formatKr(e.amountOre)}` : ''}</TableCell>
              <TableCell>{[e.channel ? CHANNEL_LABELS[e.channel] ?? e.channel : null, SOURCE_LABELS[e.source] ?? e.source].filter(Boolean).join(' · ')}</TableCell>
              <TableCell>{e.locationName ?? '—'}</TableCell><TableCell>{e.actorName ?? '—'}</TableCell><TableCell>{e.reason ?? ''}</TableCell></TableRow>
          ))}</TableBody>
        </Table></div>
      </section>
    </div>
  );
}
