'use client';
import { useState } from 'react';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FeedbackReport } from '@/lib/feedback/report';
import { summarizeFeedback } from '@/lib/feedback/metrics';

const number = (value: number | null, digits = 1) => value === null ? 'Ingen svar' : value.toLocaleString('da-DK', { maximumFractionDigits: digits, minimumFractionDigits: digits });
type Filters = Record<string, string | string[] | undefined>;
const filterValue = (input: Filters | undefined, name: string) => typeof input?.[name] === 'string' ? input[name] as string : '';
type Options = Pick<FeedbackReport, 'brands' | 'locations'>;
const csvCell = (v: unknown) => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';

export function FeedbackReportView({ report, options, error, input }: { report?: FeedbackReport; options?: Options; error?: string; input?: Filters }) {
  const data = report || options!;
  const [brandId, setBrandId] = useState(report?.filters.brandId || filterValue(input, 'brandId'));
  const [locationId, setLocationId] = useState(report?.filters.locationId || filterValue(input, 'locationId'));
  const summary = report?.summary || summarizeFeedback([]);
  const exportCsv = () => {
    if (!report) return;
    const rows = [['Brand', 'Lokation', 'Fra', 'Til', 'Svar', 'Ratingsvar', 'Gns. rating', 'NPS-svar', 'NPS', 'Rating højst 2'],
      ['Alle valgte brands', 'I alt', report.filters.from, report.filters.to, summary.responses, summary.ratedResponses, summary.averageRating ?? '', summary.npsResponses, summary.nps ?? '', summary.lowRatings],
      ...report.locationSummary.map(l => [l.brandName, l.name, report.filters.from, report.filters.to, l.responses, l.ratedResponses, l.averageRating ?? '', l.npsResponses, l.nps ?? '', l.lowRatings])];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `kvalitetsrapport-${report.filters.from}-${report.filters.to}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <section className="space-y-6" id="feedback-report" aria-label="Kvalitetsrapport">
    <style>{`@media print { body * { visibility: hidden; } #feedback-report, #feedback-report * { visibility: visible; } #feedback-report { position: absolute; left: 0; top: 0; width: 100%; } #feedback-report .overflow-x-auto { overflow: visible; } }`}</style>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Kvalitetsrapport</h1><p className="text-muted-foreground">Kundernes oplevelser på tværs af brands og lokationer.</p></div><Link className="underline print:hidden" href="/superadmin/feedback">Til indbakken</Link></div>
    <form method="get" className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 xl:grid-cols-6 print:hidden">
      <div><Label htmlFor="from">Fra dato</Label><Input id="from" name="from" type="date" defaultValue={report?.filters.from || filterValue(input, 'from')} required /></div>
      <div><Label htmlFor="to">Til dato</Label><Input id="to" name="to" type="date" defaultValue={report?.filters.to || filterValue(input, 'to')} required /></div>
      <div><Label htmlFor="report-brand">Brand</Label><select className="h-10 w-full rounded-md border bg-background px-2" id="report-brand" name="brandId" value={brandId} onChange={e => { setBrandId(e.target.value); setLocationId(''); }}><option value="">Alle mine brands</option>{data.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div><Label htmlFor="report-location">Lokation</Label><select className="h-10 w-full rounded-md border bg-background px-2" id="report-location" name="locationId" value={locationId} onChange={e => setLocationId(e.target.value)}><option value="">Alle lokationer</option>{data.locations.filter(l => !brandId || l.brandId === brandId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
      <div><Label htmlFor="report-source">Oplevelse</Label><select className="h-10 w-full rounded-md border bg-background px-2" id="report-source" name="source" defaultValue={report?.filters.source || filterValue(input, 'source') || 'all'}><option value="all">Alle oplevelser</option><option value="commerce_order">Onlineordrer</option><option value="booking">Restaurantbesøg</option></select></div>
      <Button className="self-end">Vis rapport</Button>
    </form>
    {error && <p role="alert" className="rounded-md border border-destructive p-4 text-destructive">{error}</p>}
    {report && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><p>{report.filters.from} til {report.filters.to} · dansk tid</p><div className="flex gap-2 print:hidden"><Button variant="outline" onClick={exportCsv}>Download CSV</Button><Button variant="outline" onClick={() => window.print()}>Udskriv rapport</Button></div></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[['Besvarelser', String(summary.responses), `${summary.orders} onlineordrer · ${summary.bookings} restaurantbesøg`], ['Gns. rating', summary.averageRating === null ? 'Ingen svar' : `${number(summary.averageRating)} / 5`, `${summary.ratedResponses} svar med rating`], ['NPS', number(summary.nps, 0), `${summary.npsResponses} svar · ${summary.promoters} ambassadører · ${summary.passives} passive · ${summary.detractors} kritikere`], ['Lave ratings', String(summary.lowRatings), 'Besvarelser med en rating på højst 2']].map(([label, value, note]) => <div key={label} className="rounded-lg border p-5"><h2 className="text-sm text-muted-foreground">{label}</h2><p className="mt-2 text-3xl font-bold">{value}</p><p className="mt-2 text-sm text-muted-foreground">{note}</p></div>)}
      </div>
      {summary.responses === 0 && <p role="status" className="rounded-lg bg-muted p-5">Der er ingen besvarelser i den valgte periode.</p>}
      {report.unknownLocationResponses > 0 && <p>{report.unknownLocationResponses} svar mangler en gyldig lokation. De indgår i totalen.</p>}
      <section className="space-y-3"><h2 className="text-xl font-semibold">Lokationssammenligning</h2><div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-muted">{['Lokation', 'Brand', 'Svar', 'Rating', 'NPS', 'Lave ratings'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead><tbody>{report.locationSummary.map(l => <tr key={l.id} className="border-b"><th className="p-3 font-medium">{l.name}</th><td className="p-3">{l.brandName}</td><td className="p-3">{l.responses}</td><td className="p-3">{number(l.averageRating)} <span className="text-muted-foreground">({l.ratedResponses} svar)</span></td><td className="p-3">{number(l.nps, 0)} <span className="text-muted-foreground">({l.npsResponses} svar)</span></td><td className="p-3">{l.lowRatings}</td></tr>)}</tbody></table></div></section>
      <section className="space-y-3"><h2 className="text-xl font-semibold">Udvikling pr. dag</h2><div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-muted">{['Dato', 'Svar', 'Rating', 'NPS'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{report.daily.map(day => <tr key={day.date} className="border-b"><th className="p-3 font-medium">{day.date}</th><td className="p-3">{day.responses}</td><td className="p-3">{number(day.averageRating)}</td><td className="p-3">{number(day.nps, 0)}</td></tr>)}</tbody></table></div></section>
      <p className="text-sm text-muted-foreground">Rating er gennemsnittet af stjernesvarene i hver besvarelse. Hver besvarelse vægter lige. NPS = andelen med 9–10 minus andelen med 0–6, ganget med 100. Ved flere NPS-spørgsmål bruges det første gyldige svar. Manglende ratings og NPS tæller ikke som nul. Alle besvarelser indgår uanset offentlig godkendelse.</p>
      <p className="text-sm text-muted-foreground">Svarprocent vises ikke: mailkøen registrerer accepterede hændelser, men bekræfter ikke leverede invitationer, og ældre invitationer mangler historik. Perioden følger modtagelsestidspunktet; svar uden gyldig dato indgår ikke.</p>
    </>}
  </section>;
}
