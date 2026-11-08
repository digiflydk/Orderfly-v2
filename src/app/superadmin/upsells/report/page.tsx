import { nativeCatalog } from '@/lib/access/native-catalog';
import Link from '@/components/superadmin/admin-link';
import { getUpsellReport } from './actions';
import { listScopedDocuments } from '@/lib/access/scoped-data';
import { loadSuperadminPage } from '@/lib/access/superadmin-page';
import { AccessDeniedPage } from '@/components/superadmin/access-denied-page';
export default async function Page({ searchParams }: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const p = await searchParams;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(new Date());
    const from = p.from || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), to = p.to || today;
    const result = await loadSuperadminPage('orderfly.analytics:view', async () => {
        const [report, campaignRows, catalog, products] = await Promise.all([getUpsellReport({ from, to, brand: p.brand, location: p.location, campaign: p.campaign, product: p.product, step: p.step ? Number(p.step) : undefined }), listScopedDocuments('upsells', 'orderfly.analytics:view', 'locations'), nativeCatalog('orderfly.analytics:view'), listScopedDocuments('products', 'orderfly.analytics:view', 'locations')]);
        return { report, campaigns: campaignRows.map(r => ({ id: r.id, upsellName: String(r.data().upsellName || r.id) })), brands: catalog.brands, locations: catalog.locations, products: products.map(r => ({ id: r.id, name: String(r.data().productName || r.id) })) };
    });
    if (!result)
        return <AccessDeniedPage />;
    const { report, campaigns, brands, locations, products } = result;
    const money = (n: number) => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(n);
    const rate = (n: number, d: number) => d ? `${(n / d * 100).toFixed(1)} %` : '—';
    return <main className="p-6 space-y-6"><Link href="/superadmin/upsells">Tilbage til upsell</Link><h1 className="text-2xl font-bold">Upsell-effekt</h1>
 <form className="grid gap-3 md:grid-cols-3">
 <label>Fra<input className="block border p-2" type="date" name="from" defaultValue={from} required/></label><label>Til<input className="block border p-2" type="date" name="to" defaultValue={to} required/></label>
 {([{ name: 'brand', label: 'Brand', options: brands }, { name: 'location', label: 'Restaurant', options: locations }, { name: 'campaign', label: 'Kampagne', options: campaigns.map(c => ({ id: c.id, name: c.upsellName })) }, { name: 'product', label: 'Produkt', options: products }] as const).map(f => <label key={f.name}>{f.label}<select className="block border p-2 w-full" name={f.name} defaultValue={p[f.name] || ''}><option value="">Alle</option>{f.options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>)}
 <label>Trin<select className="block border p-2" name="step" defaultValue={p.step || ''}><option value="">Alle</option><option value="1">Trin 1</option><option value="2">Trin 2</option></select></label><button className="rounded bg-primary text-primary-foreground p-2">Vis resultater</button></form>
 <table className="w-full text-left"><thead><tr><th>Måling</th><th>Resultat</th></tr></thead><tbody>{[['Viste tilbud', report.offers], ['Accepterede tilbud', report.accepted], ['Afviste tilbud', report.rejected], ['Acceptprocent', rate(report.accepted, report.offers)], ['Betalte ordrer med upsell', report.paidOrders], ['Solgte enheder før delvise refunderinger', report.units], ['Nettoomsætning via upsell', money(report.revenue)], ['Vare- og fordelt ordrerabat', money(report.discount)]].map(([label, value]) => <tr key={label} className="border-b"><td className="py-2">{label}</td><td>{value}</td></tr>)}</tbody></table>
 <h2 className="text-xl font-semibold">Kontrolgruppe og tilbudsgruppe</h2><p>Kun sessioner med statistik-samtykke og et kvalificerende første tilbud. Sammenlign samme kampagne og restaurant. Produkt- og trinfiltre gælder ikke denne sammenligning. Sessioner med blandet gruppetildeling udelades.</p>
 <table className="w-full text-left"><thead><tr><th>Gruppe</th><th>Sessioner</th><th>Købende sessioner</th><th>Købsrate</th><th>Netto pr. session</th><th>Gns. ordreværdi</th></tr></thead><tbody>{(['control', 'treatment'] as const).map(g => { const row = report.cohorts[g]; return <tr key={g}><td>{g === 'control' ? 'Uden upsell' : 'Med upsell'}</td><td>{row.sessions}</td><td>{row.purchases}</td><td>{rate(row.purchases, row.sessions)}</td><td>{row.sessions ? money(row.revenue / row.sessions) : '—'}</td><td>{row.orders ? money(row.revenue / row.orders) : '—'}</td></tr>; })}</tbody></table>
 <p>Omsætning bygger på betalte, ikke-annullerede ordrer. {report.partialRefunds} ordrer har delvise refunderinger; deres upsell-omsætning er forholdsmæssigt estimeret, fordi refunderingen ikke angiver varelinjer. Ældre ordrer uden målesnapshot indgår ikke i produkttallene. Besøg og køb afgrænses begge til den valgte periode, så nylige perioder kan være ufuldstændige. Tallene er observationer, ikke et bevis på statistisk sikker meromsætning.</p>
 <h2 className="text-xl font-semibold">Badges og tilvalg</h2><p>Produktvisninger tælles, når mindst halvdelen af produktkortet er synligt. Sammenligningen er beskrivende: produkter med badges kan også være populære i forvejen.</p><table className="w-full text-left"><thead><tr><th>Badge</th><th>Visninger</th><th>Tilvalg</th><th>Acceptprocent</th></tr></thead><tbody>{Object.entries(report.badges).map(([key, row]) => { const [source, badge] = key.split(':'); const label = badge === 'popular' ? 'Populær' : badge === 'recommended' ? 'Vi anbefaler' : 'Ingen badge'; return <tr key={key}><td>{label} ({source === 'manual' ? 'manuel' : source === 'auto' ? 'automatisk' : 'uden'})</td><td>{row.views}</td><td>{row.accepted}</td><td>{rate(row.accepted, row.views)}</td></tr>; })}</tbody></table>
 </main>;
}
