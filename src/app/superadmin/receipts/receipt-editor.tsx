'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_RECEIPT_SETTINGS, receiptSettingsSchema, type ReceiptSettings } from '@/lib/receipts/settings';
import { ReceiptPreview, SAMPLE_RECEIPT } from '@/components/receipts/receipt-preview';
import { TestBonPreview } from '@/components/receipts/testbon-preview';

type Snapshot = { brandId: string; revision: number; settings: ReceiptSettings };
const inputClass = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2';
const buttonClass = 'rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50';
const toggles = [
  ['showBrandName', 'Brandnavn'], ['showLocationName', 'Lokationsnavn'],
  ['showCustomer', 'Kundens navn'], ['showContact', 'Kundens kontaktoplysninger'],
  ['showModifiers', 'Tilvalg'], ['showNotes', 'Ordrenoter'],
] as const;

function snapshot(value: unknown, brandId: string): Snapshot {
  const data = value as Partial<Snapshot> | null;
  const parsed = receiptSettingsSchema.safeParse(data?.settings);
  if (!data || data.brandId !== brandId || !Number.isSafeInteger(data.revision) || (data.revision as number) < 0 || !parsed.success) {
    throw new Error('Ugyldigt svar. Genindlæs indstillingerne.');
  }
  return { brandId, revision: data.revision as number, settings: parsed.data };
}

export function ReceiptEditor({ brands, initialBrandId, testModel, testPaperWidthMm }: {
  brands: { id: string; name: string }[]; initialBrandId?: string;
  testModel?: 'mc-print2' | 'mc-print3'; testPaperWidthMm?: 58 | 80;
}) {
  const [brandId, setBrandId] = useState(brands.some(brand => brand.id === initialBrandId) ? initialBrandId! : brands[0]?.id ?? '');
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const submitting = useRef(false);
  const dirty = !!saved && JSON.stringify(saved.settings) !== JSON.stringify(draft);
  const valid = receiptSettingsSchema.safeParse(draft).success;

  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();
    setSaved(null); setError(''); setNotice(''); setBlocked(false); setSaving(false);
    submitting.current = false;
    if (!brandId) { setLoading(false); return () => { ++generation.current; }; }
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/superadmin/receipts?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403
          ? 'Du har ikke adgang til kvitteringsindstillingerne. Log ind igen eller kontakt en administrator.'
          : 'Kvitteringsindstillingerne kunne ikke indlæses. Prøv igen.');
        const result = snapshot(await response.json(), brandId);
        if (generation.current !== id) return;
        setSaved(result); setDraft(result.settings);
      } catch (cause) {
        if (generation.current === id && !controller.signal.aborted) setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : 'Kvitteringsindstillingerne kunne ikke indlæses. Prøv igen.');
      } finally { if (generation.current === id) setLoading(false); }
    })();
    return () => { ++generation.current; controller.abort(); };
  }, [brandId, reload]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function discardAllowed() { return !dirty || window.confirm('Du har ændringer, som ikke er gemt. Vil du kassere dem?'); }
  function reloadSettings() {
    if (!discardAllowed()) return;
    ++generation.current; setSaved(null); setLoading(true); setReload(value => value + 1);
  }
  function edit<K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) {
    setDraft(current => ({ ...current, [key]: value })); setNotice('');
  }
  async function save() {
    if (!saved || !dirty || !valid || blocked || submitting.current || saved.brandId !== brandId) return;
    submitting.current = true; setSaving(true); setError(''); setNotice('');
    const id = generation.current;
    try {
      const response = await fetch('/api/superadmin/receipts', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, expectedRevision: saved.revision, settings: draft }) });
      if (generation.current !== id) return;
      if (response.status === 409) throw new Error('En anden har ændret indstillingerne. Genindlæs og gennemgå den seneste version, før du gemmer igen.');
      if (response.status === 401 || response.status === 403) throw new Error('Adgangen er ændret. Log ind igen, og genindlæs indstillingerne.');
      if (!response.ok) throw new Error('Gemningen kunne ikke bekræftes. Genindlæs for at kontrollere den gemte version, før du prøver igen.');
      const result = snapshot(await response.json(), brandId);
      if (generation.current !== id) return;
      setSaved(result); setDraft(result.settings); setNotice('Kvitteringsindstillingerne er gemt.');
    } catch (cause) {
      if (generation.current === id) {
        setBlocked(true);
        setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : 'Gemningen kunne ikke bekræftes. Genindlæs for at kontrollere den gemte version, før du prøver igen.');
      }
    } finally {
      if (generation.current === id) { submitting.current = false; setSaving(false); }
    }
  }

  return <div className="space-y-6 p-4 md:p-6">
    <header><h1 className="text-2xl font-semibold">Kvitteringer</h1>
      <p className="mt-2 text-sm text-muted-foreground">Tilpas kvitteringens onlinevisning pr. brand. Forhåndsvisningen opdateres med det samme; ændringer gemmes først, når du trykker Gem. Indstillingerne ændrer endnu ikke fysiske kundeudskrifter.</p>
    </header>
    <nav aria-label="Bontype" className="flex flex-wrap gap-3">
      <a aria-current="page" className={`${buttonClass} bg-primary text-primary-foreground`} href={`/superadmin/receipts?brandId=${encodeURIComponent(brandId)}`}>Kundekvittering</a>
      <a className={buttonClass} href={`/superadmin/receipts?type=kitchen&brandId=${encodeURIComponent(brandId)}`}>Køkkenbon</a>
    </nav>
    {!brands.length ? <p>Der er ingen brands tilgængelige.</p> : <>
      <label className="block max-w-md text-sm font-medium">Brand<select aria-label="Brand" className={inputClass} value={brandId} disabled={saving} onChange={event => {
        if (!discardAllowed()) return;
        ++generation.current; setSaved(null); setLoading(true); setBrandId(event.target.value);
      }}>{brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
      {loading && <p role="status">Indlæser kvitteringsindstillinger…</p>}
      {error && <div role="alert" className="rounded-md border border-destructive p-3">{error}</div>}
      {notice && <p role="status">{notice}</p>}
      {!loading && <button type="button" className={buttonClass} disabled={saving} onClick={reloadSettings}>Genindlæs indstillinger</button>}
      {saved?.brandId === brandId && !loading && <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="min-w-0 rounded-lg border p-4" aria-labelledby="receipt-fields">
          <h2 id="receipt-fields" className="text-lg font-semibold">Bonoplysninger</h2>
          <fieldset className="mt-4 space-y-4" disabled={saving || blocked}>
            <label className="block text-sm font-medium">Papirbredde<select aria-label="Papirbredde" className={inputClass} value={draft.paperWidthMm} onChange={event => edit('paperWidthMm', Number(event.target.value) as 58 | 80)}><option value={58}>58 mm</option><option value={80}>80 mm</option></select></label>
            <label className="block text-sm font-medium">Overskrift<input aria-label="Overskrift" className={inputClass} maxLength={80} value={draft.heading} onChange={event => edit('heading', event.target.value)} /></label>
            <label className="block text-sm font-medium">Adresse<textarea aria-label="Adresse" className={inputClass} maxLength={160} value={draft.address} onChange={event => edit('address', event.target.value)} /></label>
            <label className="block text-sm font-medium">Telefon<input aria-label="Telefon" className={inputClass} maxLength={40} value={draft.phone} onChange={event => edit('phone', event.target.value)} /></label>
            <label className="block text-sm font-medium">Hjemmeside<input aria-label="Hjemmeside" className={inputClass} maxLength={120} value={draft.website} onChange={event => edit('website', event.target.value)} /></label>
            <label className="block text-sm font-medium">Bundtekst<textarea aria-label="Bundtekst" className={inputClass} maxLength={240} value={draft.footer} onChange={event => edit('footer', event.target.value)} /></label>
            <div className="space-y-2"><p className="text-sm font-medium">Vis på kvitteringen</p>{toggles.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft[key]} onChange={event => edit(key, event.target.checked)} />{label}</label>)}</div>
          </fieldset>
          <p className="mt-4 text-xs text-muted-foreground">Ordrenummer, varer og beløb bevares. Slå valgfrie oplysninger fra, eller ryd tekstfelterne for at fjerne dem.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" className={`${buttonClass} bg-primary text-primary-foreground`} onClick={() => void save()} disabled={!dirty || !valid || saving || blocked}>{saving ? 'Gemmer…' : 'Gem kvittering'}</button><span className="text-sm">{dirty ? 'Ikke-gemte ændringer' : `Gemt version ${saved.revision}`}</span></div>
          {!valid && <p role="alert" className="mt-2 text-sm">Kontrollér tekstfelterne. Indholdet kan ikke gemmes i denne form.</p>}
        </section>
        <section className="min-w-0 space-y-3 rounded-lg border bg-muted/30 p-4" aria-labelledby="receipt-sample">
          <h2 id="receipt-sample" className="text-lg font-semibold">Forhåndsvisning af kundekvittering</h2>
          <p className="text-sm text-muted-foreground">Eksempel med fiktive ordredata. Den fysiske udskrift skal fortsat kontrolleres på printeren.</p>
          <ReceiptPreview settings={draft} order={{ ...SAMPLE_RECEIPT, brandName: brands.find(brand => brand.id === brandId)?.name ?? SAMPLE_RECEIPT.brandName }} />
        </section>
      </div>}
    </>}
    <TestBonPreview model={testModel} paperWidthMm={testPaperWidthMm ?? (saved?.brandId === brandId ? draft.paperWidthMm : 80)} />
  </div>;
}
