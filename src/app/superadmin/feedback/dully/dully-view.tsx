'use client';

import { useEffect, useRef, useState } from 'react';
import Link from '@/components/superadmin/admin-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { DullyFeedbackState } from '@/lib/feedback/dully-admin';
import { approveDullyTest, importDullyOrders, loadDullyFeedback, pauseDullyFeedback, saveDullyConfiguration, sendDullyTest } from './actions';

type Scope = { brandId: string; locationId: string };
type Result = { ok: boolean; message?: string; state?: DullyFeedbackState | null };
type Preview = { count: number; rows: Record<string, unknown>[] };
const selectStyle = 'h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm';
const states: Record<string, string> = {
  pending: 'I kø', preparing: 'Forberedes', dispatching: 'Afventer svar', accepted: 'Accepteret af mPanel',
  uncertain: 'Kræver kontrol', failed: 'Fejl', suppressed: 'Stoppet', waiting: 'Afventer afsendelse',
  not_queued: 'Ikke sat i kø', none: 'Ikke sat i kø', completed: 'Gennemført', cancelled: 'Annulleret',
};
const label = (state: string) => states[state] || state || 'Ikke sat i kø';
const date = (value: number | string) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }) : '–';
};

export function DullyFeedbackView({ brands, locations }: {
  brands: { id: string; name: string }[];
  locations: { id: string; brandId: string; name: string }[];
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id || '');
  const [locationId, setLocationId] = useState(locations.find(location => location.brandId === brands[0]?.id)?.id || '');
  const [state, setState] = useState<DullyFeedbackState | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Result | null>(null);
  const [accountId, setAccountId] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [json, setJson] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [experienceType, setExperienceType] = useState<'pickup' | 'delivery'>('pickup');
  const [confirmed, setConfirmed] = useState(false);
  const loadGeneration = useRef(0);
  const scope: Scope = { brandId, locationId };
  const configured = Boolean(state?.configuration);
  const canEdit = state?.canEdit === true && !busy && !loading;
  const approved = Boolean(state?.configuration?.approvedAt && state.configuration.approvedTestSourceId === state.configuration.testSourceId);
  const apply = (next: DullyFeedbackState) => {
    setState(next);
    setConfirmed(false);
    setAccountId(next.configuration?.accountId || '');
    setRestaurantId(next.configuration?.restaurantId || '');
  };

  useEffect(() => {
    const generation = ++loadGeneration.current;
    setState(null); setMessage(null); setAccountId(''); setRestaurantId(''); setConfirmed(false); setPreview(null); setJson('');
    if (!brandId || !locationId) { setLoading(false); return; }
    setLoading(true);
    loadDullyFeedback({ brandId, locationId }).then(result => {
      if (generation !== loadGeneration.current) return;
      if (result.ok) apply(result.state); else setMessage(result);
    }).catch(() => {
      if (generation === loadGeneration.current) setMessage({ ok: false, message: 'Kunne ikke hente status. Prøv igen.' });
    }).finally(() => { if (generation === loadGeneration.current) setLoading(false); });
    return () => { ++loadGeneration.current; };
  }, [brandId, locationId]);

  async function run(operation: () => Promise<Result>) {
    if (busy || loading) return;
    setBusy(true); setMessage(null);
    try {
      const result = await operation(); setMessage(result);
      if (result.ok && result.state) { apply(result.state); setConfirmed(false); }
      // A write succeeded but its refresh failed: stop further writes until a fresh read.
      if (result.ok && result.state === null) setState(null);
    } catch { setMessage({ ok: false, message: 'Forbindelsen blev afbrudt. Dine indtastninger er bevaret. Opdatér status før du prøver igen.' }); setState(null); }
    finally { setBusy(false); }
  }
  async function refresh() {
    if (busy || loading || !brandId || !locationId) return;
    setBusy(true); setMessage(null);
    try { const result = await loadDullyFeedback(scope); if (result.ok) apply(result.state); else setMessage(result); }
    catch { setMessage({ ok: false, message: 'Kunne ikke hente status. Prøv igen.' }); }
    finally { setBusy(false); }
  }
  function makePreview() {
    setMessage(null); setPreview(null);
    try {
      if (json.length > 500000) throw new Error();
      const rows: unknown = JSON.parse(json);
      if (!Array.isArray(rows) || !rows.length || rows.length > 100 || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error();
      setPreview({ count: rows.length, rows: rows as Record<string, unknown>[] });
    } catch { setMessage({ ok: false, message: 'Indsæt gyldig JSON med en liste på 1–100 ordrer. Ingen data er importeret.' }); }
  }

  return <div className="mx-auto w-full max-w-6xl space-y-6 pb-8">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Dully-feedback</h1><p className="mt-1 text-sm text-muted-foreground">Takeaway-feedback fra Dully-ordrer, samlet i Orderfly.</p></div>
      <Button type="button" variant="outline" disabled={busy || loading || !brandId || !locationId} onClick={refresh}>Opdatér status</Button>
    </header>
    <section className="grid gap-4 rounded-lg border p-5 sm:grid-cols-2" aria-label="Vælg brand og location">
      <div className="space-y-2"><Label htmlFor="dully-brand">Brand</Label><select id="dully-brand" className={selectStyle} value={brandId} disabled={busy} onChange={event => {
        const next = event.target.value; setBrandId(next); setLocationId(locations.find(location => location.brandId === next)?.id || '');
      }}>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="dully-location">Location</Label><select id="dully-location" className={selectStyle} value={locationId} disabled={busy} onChange={event => setLocationId(event.target.value)}>{locations.filter(location => location.brandId === brandId).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div>
      {!locationId && <p className="text-sm text-muted-foreground sm:col-span-2">Der er ingen aktive locations for dette brand.</p>}
    </section>
    {message?.message && <p role={message.ok ? 'status' : 'alert'} className={'rounded-lg border p-4 text-sm break-words ' + (message.ok ? '' : 'border-destructive text-destructive')}>{message.message}</p>}
    {loading && <p role="status">Henter Dully-feedback…</p>}
    {state && <>
      <section className="space-y-4 rounded-lg border p-5" aria-label="Dully-datakilde">
        <div><h2 className="text-lg font-semibold">1. Dully-datakilde</h2><p className="mt-1 text-sm text-muted-foreground">Ordredata indlæses fra et kontrolleret Dully-udtræk. Denne funktion logger ikke automatisk ind på Dully. Afsendelse og besvarelser håndteres af Orderfly.</p></div>
        <form className="grid items-end gap-4 md:grid-cols-3" onSubmit={event => { event.preventDefault(); void run(() => saveDullyConfiguration({ ...scope, accountId: accountId.trim(), restaurantId: restaurantId.trim() })); }}>
          <div className="space-y-2"><Label htmlFor="dully-account">Dully-kontoreference</Label><Input id="dully-account" value={accountId} required maxLength={120} disabled={!canEdit || configured} onChange={event => setAccountId(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="dully-restaurant">Dully-restaurantreference</Label><Input id="dully-restaurant" value={restaurantId} required maxLength={120} disabled={!canEdit || configured} onChange={event => setRestaurantId(event.target.value)} /></div>
          <Button type="submit" disabled={!canEdit || configured}>{configured ? 'Datakilde gemt' : 'Gem datakilde'}</Button>
        </form>
        <p className="text-sm text-muted-foreground">Vælg faste referencer for den Dully-konto og restaurant, du har kontrolleret. Brug samme restaurantreference i udtrækkets externalRestaurantId. Referencerne knytter alle importer til dette brand og denne location og kan ikke ændres bagefter.</p>
        {!state.canEdit && <p className="text-sm text-muted-foreground">Du har læseadgang. Ændringer kræver adgang til at redigere feedback for brandet.</p>}
      </section>
      <section className="space-y-4 rounded-lg border p-5" aria-label="Importér Dully-ordrer">
        <div><h2 className="text-lg font-semibold">2. Indlæs ordrer</h2><p className="mt-1 text-sm text-muted-foreground">Forhåndsvis udtrækket før import. Kun gennemførte og betalte ordrer fra 31. oktober 2026 eller senere kan inviteres. Identiske ordrer importeres ikke igen.</p></div>
        <details className="text-sm"><summary className="cursor-pointer font-medium underline">Se importformat</summary><div className="mt-3 space-y-2 text-muted-foreground"><p>En JSON-liste med højst 100 ordrer. Hver ordre skal have disse felter:</p><p className="break-words font-mono text-xs">externalOrderId, orderNumber, externalRestaurantId, email, experienceType, orderedAt, completedAt, status, paymentStatus</p><p>experienceType: pickup eller delivery. status: completed, pending eller cancelled. paymentStatus: paid, unpaid eller refunded. Datoer skal være ISO-datoer med tidszone. completedAt er null, indtil ordren er afsluttet. Brug Dullys stabile interne ordre-ID, ikke kun det viste ordrenummer.</p></div></details>
        <div className="space-y-2"><Label htmlFor="dully-json">Ordreudtræk (JSON)</Label><textarea id="dully-json" className="min-h-40 w-full min-w-0 rounded-md border bg-background p-3 font-mono text-xs" value={json} maxLength={500000} spellCheck={false} disabled={!canEdit || !configured} onChange={event => { setJson(event.target.value); setPreview(null); }} aria-describedby="dully-import-note" /></div>
        <p id="dully-import-note" className="text-sm text-muted-foreground">Import opretter feedbackgrundlag. Den opretter ingen salgsordrer og sender ikke mails med det samme.</p>
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={!canEdit || !configured || !json.trim()} onClick={makePreview}>Forhåndsvis import</Button><Button type="button" disabled={!canEdit || !configured || !preview} onClick={() => void run(() => importDullyOrders({ ...scope, json }))}>Importér {preview ? preview.count + ' ordrer' : 'ordrer'}</Button></div>
        {preview && <div className="space-y-2 rounded-md bg-muted/40 p-3"><p className="text-sm font-medium">{preview.count} ordrer i udtrækket. Felter, restaurant og status kontrolleres på serveren ved import.</p><ul className="space-y-2 text-sm">{preview.rows.slice(0, 5).map((row, index) => <li key={index} className="break-words">#{String(row.orderNumber || 'Mangler ordrenummer')} · {row.experienceType === 'delivery' ? 'Levering' : row.experienceType === 'pickup' ? 'Afhentning' : 'Ukendt type'} · {label(String(row.status || 'Ukendt status'))}</li>)}</ul>{preview.count > 5 && <p className="text-xs text-muted-foreground">Viser de første 5 af {preview.count} ordrer.</p>}</div>}
      </section>
      <section className="space-y-4 rounded-lg border p-5" aria-label="Test og godkendelse">
        <div><h2 className="text-lg font-semibold">3. Test og godkend</h2><p className="mt-1 text-sm text-muted-foreground">Testmailen bruger samme afsender, skabelon og takeaway-skema som kundemails. Modtageren er fast: <span className="break-all font-medium">ok@esmeraldapizza.dk</span>.</p></div>
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-40 flex-1 space-y-2"><Label htmlFor="dully-experience">Testskema</Label><select id="dully-experience" className={selectStyle} value={experienceType} disabled={!canEdit} onChange={event => setExperienceType(event.target.value as 'pickup' | 'delivery')}><option value="pickup">Afhentning</option><option value="delivery">Levering</option></select></div><Button type="button" disabled={!canEdit || !configured || Boolean(state.test && ['pending', 'preparing', 'dispatching', 'uncertain'].includes(state.test.state))} onClick={() => void run(() => sendDullyTest({ ...scope, experienceType }))}>Send testmail</Button></div>
        {state.test ? <div className="space-y-1 text-sm"><p>Seneste test: <strong>{label(state.test.state)}</strong> · {state.test.experienceType === 'pickup' ? 'Afhentning' : 'Levering'}</p><p className="text-muted-foreground">Accepteret af mPanel betyder lagt i mailplatformens kø. Det beviser ikke, at mailen er leveret. Kontrollér også din indbakke og linket i mailen.</p></div> : <p className="text-sm text-muted-foreground">Der er endnu ikke registreret en test for denne datakilde.</p>}
        {!approved && <div className="space-y-3 border-t pt-4"><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={confirmed} disabled={!canEdit || state.test?.state !== 'accepted'} onChange={event => setConfirmed(event.target.checked)} /><span>Jeg har modtaget testmailen og godkendt indholdet og det tilknyttede feedbackskema.</span></label><Button type="button" disabled={!canEdit || !confirmed || state.test?.state !== 'accepted'} onClick={() => state.test && void run(() => approveDullyTest({ ...scope, testSourceId: state.test!.sourceId, confirmed }))}>Godkend test</Button></div>}
        {approved && <p className="text-sm font-medium">Testen er godkendt.</p>}
      </section>
      <section className="space-y-4 rounded-lg border p-5" aria-label="Daglig afsendelse">
        <h2 className="text-lg font-semibold">4. Daglig afsendelse</h2>
        {!state.masterEmailEnabled && <p className="rounded-md bg-muted/50 p-3 text-sm">Feedbackmails til kunder er slået fra for brandet. Dully sender derfor ingen kundemails. En testmail kan stadig sendes til den faste testadresse. Aktivér kundemails særskilt under <Link href="/superadmin/feedback/settings" className="underline">Feedbackindstillinger</Link>, når testen er godkendt.</p>}
        <p className="text-sm">Hver dag kl. <strong>21.00 dansk tid</strong>, også i weekenden. Orderfly behandler de importerede ordrer, som endnu ikke har fået en invitation. Nye ordrer skal løbende indlæses fra Dully.</p>
        <p className="text-sm text-muted-foreground">Ordrer indlæst efter dagens kørsel behandles ved en senere kørsel. Annullerede og refunderede ordrer springes over. En pause bevarer ventende ordrer.</p>
        <div className="flex flex-wrap items-center gap-3"><span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{state.configuration?.paused === false ? (state.masterEmailEnabled ? 'Aktiv' : 'Stoppet: kundemails er slået fra') : 'På pause'}</span><Button type="button" variant={state.configuration?.paused === false ? 'outline' : 'default'} disabled={!canEdit || !configured || (state.configuration?.paused !== false && (!approved || !state.masterEmailEnabled))} onClick={() => void run(() => pauseDullyFeedback({ ...scope, paused: state.configuration?.paused === false }))}>{state.configuration?.paused === false ? 'Sæt på pause' : 'Aktivér daglig afsendelse'}</Button></div>
        {!approved && <p className="text-sm text-muted-foreground">Kundemails er spærret, indtil testen er godkendt.</p>}
      </section>
      <section className="space-y-4" aria-label="Afsendelseshistorik">
        <div><h2 className="text-lg font-semibold">Ordrer og afsendelser</h2><p className="text-sm text-muted-foreground">Status for de seneste 500 importerede ordrer på den valgte location. Tallene nedenfor gælder den viste historik. Testmails indgår ikke i kundetallene.</p>{state.hasMore && <p className="mt-2 text-sm font-medium">Der findes ældre historik. Den er ikke med i denne visning eller i tallene nedenfor.</p>}</div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{([
          ['Importerede', state.counts.imported], ['Berettigede', state.counts.eligible], ['I kø', state.counts.pending], ['Accepteret', state.counts.accepted], ['Fejl', state.counts.failed], ['Kræver kontrol', state.counts.uncertain],
        ] as const).map(([name, count]) => <div className="rounded-lg border p-3" key={name}><dt className="text-xs text-muted-foreground">{name}</dt><dd className="mt-1 text-xl font-semibold">{count}</dd></div>)}</dl>
        {state.rows.length === 0 && <p className="rounded-lg border p-5 text-sm text-muted-foreground">Ingen Dully-ordrer er importeret for denne location.</p>}
        <ul className="space-y-3">{state.rows.map(row => <li key={row.id} className="space-y-2 rounded-lg border p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{row.isTest ? 'Testmail' : 'Ordre #' + row.orderNumber} · {row.experienceType === 'delivery' ? 'Levering' : 'Afhentning'}</strong><span>{label(row.mailState)}</span></div><p className="break-all text-muted-foreground">{row.email}</p><div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>Ordredato: {date(row.orderedAt)}</span><span>Ordrestatus: {label(row.status)}</span><span>Opdateret: {date(row.updatedAt)}</span></div><p className="break-all text-xs text-muted-foreground">Kilde-ID: {row.id}</p>{row.mailState === 'uncertain' && <p className="text-sm">Kontrollér beskeden i mPanel. Den sendes ikke automatisk igen, når afsendelsesresultatet er ukendt.</p>}</li>)}</ul>
      </section>
    </>}
    <Link href="/superadmin/feedback/settings" className="inline-block text-sm underline">Feedbackindstillinger</Link>
  </div>;
}
