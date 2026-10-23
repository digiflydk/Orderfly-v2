'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { QrLifetime } from '@/lib/qr/lifetime';

export type QrKind = 'dynamic' | 'static';
export type QrStaticType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'phone' | 'sms';
export type QrStatus = 'active' | 'paused' | 'archived';
export type QrDraft = {
  name: string; brandId: string; locationId: string | null; kind: QrKind;
  destination: string; staticType: QrStaticType; fields: Record<string, string>;
  campaign: string; tags: string[];
  utm: { source: string; medium: string; campaign: string; content: string; term: string };
  expiresAt?: number | null;
  style?: import('@/lib/qr/store').QrDesign;
};
export type QrCodeSummary = QrDraft & { id: string; revision: string; status: QrStatus; publicUrl?: string };
export type QrBrandChoice = { id: string; name: string; locations: Array<{ id: string; name: string }>; allowWholeBrand?: boolean };
export type QrCapabilities = { create: boolean; edit: boolean; archive: boolean; export: boolean };
export type QrPreview = { imageUrl: string; payload: string };
export type QrManagerApi = {
  save: (draft: QrDraft, context: { id?: string; revision?: string; requestId: string }) => Promise<QrCodeSummary>;
  setStatus: (id: string, status: QrStatus, context: { revision: string; requestId: string; brandId?: string }) => Promise<QrCodeSummary>;
  preview: (draft: QrDraft, context: { id?: string; revision?: string }) => Promise<QrPreview>;
  download: (draft: QrDraft, format: 'png' | 'svg', context: { id?: string; revision?: string }) => Promise<{ url: string; filename: string }>;
};
export type QrManagerProps = { brands: QrBrandChoice[]; initialCodes: QrCodeSummary[]; capabilities: QrCapabilities; api: QrManagerApi; dynamicEnabled?: boolean;
  allTime?: Record<string, QrLifetime | null>; onAnalytics?: (code: QrCodeSummary) => void; analyticsCodeKeys?: string[];
  renderExtras?: (draft: QrDraft, context: { id?: string; revision?: string }, change: (patch: Partial<QrDraft>) => void, uploadBusy: (busy: boolean) => void, needsSave: boolean) => React.ReactNode };

const blank = (brandId = ''): QrDraft => ({ name: '', brandId, locationId: null, kind: 'dynamic', destination: '', staticType: 'url', fields: {}, campaign: '', tags: [], utm: { source: '', medium: 'qr', campaign: '', content: '', term: '' } });
const fieldClass = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const buttonClass = 'qr-button rounded-md border px-3 py-2 text-sm disabled:opacity-50';
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem' };
const STATIC_FIELDS: Record<QrStaticType, Array<[string, string, 'text' | 'email' | 'tel' | 'password']>> = {
  url: [], text: [['text', 'Tekst', 'text']],
  wifi: [['ssid', 'Netværksnavn', 'text'], ['password', 'Wi-Fi-adgangskode', 'password'], ['security', 'Sikkerhed (WPA, WEP eller nopass)', 'text']],
  vcard: [['name', 'Fulde navn', 'text'], ['organization', 'Virksomhed', 'text'], ['phone', 'Telefonnummer', 'tel'], ['email', 'E-mailadresse', 'email']],
  email: [['to', 'Modtager', 'email'], ['subject', 'Emne', 'text'], ['body', 'Besked', 'text']],
  phone: [['phone', 'Telefonnummer', 'tel']], sms: [['phone', 'Telefonnummer', 'tel'], ['body', 'Besked', 'text']],
};
const STATIC_NAMES: Record<QrStaticType, string> = { url: 'Webadresse', text: 'Tekst', wifi: 'Wi-Fi', vcard: 'Kontaktkort', email: 'E-mail', phone: 'Telefon', sms: 'SMS' };
const STATUS_NAMES: Record<QrStatus, string> = { active: 'Aktiv', paused: 'På pause', archived: 'Arkiveret' };
const DEFAULT_STYLE: NonNullable<QrDraft['style']> = { width: 512, dark: '#000000', light: '#ffffff', errorCorrectionLevel: 'M', margin: 4 };
const copenhagenDate = (at: number) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
function copenhagenMidnight(day: string): number {
  const utc = Date.parse(day + 'T00:00:00Z');
  for (const offset of [1, 2]) {
    const candidate = utc - offset * 3_600_000;
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', hourCycle: 'h23' }).format(new Date(candidate));
    if (hour === '00' && copenhagenDate(candidate) === day) return candidate;
  }
  throw new Error('invalid_date');
}
const draftOf = (code: QrDraft): QrDraft => ({ name: code.name, brandId: code.brandId, locationId: code.locationId, kind: code.kind,
  destination: code.destination, staticType: code.staticType, fields: { ...code.fields }, campaign: code.campaign, tags: [...code.tags], utm: { ...code.utm },
  ...(code.expiresAt !== undefined ? { expiresAt: code.expiresAt } : {}), ...(code.style ? { style: { ...code.style } } : {}) });

function errorText(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'revision_conflict' || code === 'conflict') return 'QR-koden er ændret af en anden. Dine felter er bevaret. Luk formularen og åbn den igen efter genindlæsning.';
  if (code === 'forbidden' || code === 'unauthorized') return 'Du har ikke adgang til denne handling. Dine felter er bevaret.';
  if (code === 'invalid_input' || code === 'invalid_destination') return 'Kontrollér felterne og webadressen. Dine felter er bevaret.';
  return 'Handlingen kunne ikke bekræftes. Dine felter er bevaret. Prøv igen med samme handling.';
}

// Image/download providers must return local blob/data URLs or trusted same-origin
// routes. Never navigate to arbitrary URLs returned by an untrusted payload.
function trustedAssetUrl(value: string, image = false): string {
  if (value.startsWith('blob:') && new URL(value).origin === window.location.origin) return value;
  if (image && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error('untrusted_asset');
  return url.href;
}

// Previews use the authenticated renderer, never the destination or public redirect.
// Only visible, published rows are rendered; no scans are recorded by browsing admin.
function QrThumbnail({ code, api, enabled }: { code: QrCodeSummary; api: QrManagerApi; enabled: boolean }) {
  const [image, setImage] = useState(''), [failed, setFailed] = useState(false);
  const target = useRef<HTMLDivElement>(null), latestApi = useRef(api); latestApi.current = api;
  const key = JSON.stringify([code.brandId, code.id, code.revision, code.publicUrl]);
  useEffect(() => {
    let active = true; setImage(''); setFailed(false);
    if (!enabled || !/^https:\/\/orderfly\.dk\/q\/[a-f0-9]{32}$/.test(code.publicUrl || '')) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void latestApi.current.preview(draftOf(code), { id: code.id, revision: code.revision }).then(result => {
        if (active) setImage(trustedAssetUrl(result.imageUrl, true));
      }).catch(() => { if (active) setFailed(true); });
    });
    if (target.current) observer.observe(target.current);
    return () => { active = false; observer.disconnect(); };
  // A revision identifies the immutable preview input; API identities change on refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return <div ref={target} className="qr-thumbnail">{image ? <img src={image} alt={`QR-kode: ${code.name}`} width={96} height={96} /> : <span className="qr-thumbnail-placeholder">{failed ? 'Preview utilgængeligt' : 'QR'}</span>}</div>;
}

export function QrManager({ brands, initialCodes, capabilities, api, dynamicEnabled = true, renderExtras, allTime, onAnalytics, analyticsCodeKeys = [] }: QrManagerProps) {
  const [codes, setCodes] = useState(initialCodes);
  // Refresh only catalogue rows. A sibling bulk refresh must never discard an
  // unresolved editor operation, its original request key or draft.
  useEffect(() => { setCodes(initialCodes); }, [initialCodes]);
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const [campaign, setCampaign] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(0);
  const [status, setStatusFilter] = useState<'all' | QrStatus>('all');
  useEffect(() => { setPage(0); }, [search, status, campaign, sort]);
  const [draft, setDraft] = useState<QrDraft | null>(null);
  const [editing, setEditing] = useState<QrCodeSummary | null>(null);
  const [preview, setPreview] = useState<QrPreview | null>(null);
  const [pendingArchive, setPendingArchive] = useState<QrCodeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadBusy,setUploadBusy]=useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // A synchronous guard closes the double-click window before React rerenders.
  const running = useRef(false);
  const retry = useRef<{ key: string; requestId: string } | null>(null);
  const generation = useRef(0);
  const retryOperation = useRef<(() => Promise<void>) | null>(null);
  const defaultBrand = brands.find(brand => brand.allowWholeBrand !== false || brand.locations.length > 0);
  const requestId = (key: string) => {
    if (retry.current?.key !== key) retry.current = { key, requestId: crypto.randomUUID() };
    return retry.current.requestId;
  };
  const change = (patch: Partial<QrDraft>) => { setDraft(current => current ? { ...current, ...patch } : current); setPreview(null); generation.current++; setError(''); };
  const open = (code?: QrCodeSummary, duplicate = false) => {
    if (running.current || uncertain) return;
    generation.current++; retry.current = null; setPreview(null); setError(''); setNotice(''); setEditing(code && !duplicate ? code : null);
    setDraft(code ? { ...draftOf(code), name: duplicate ? `${code.name} (kopi)` : code.name } : { ...blank(defaultBrand?.id), kind: dynamicEnabled ? 'dynamic' : 'static', locationId: defaultBrand?.allowWholeBrand === false ? defaultBrand.locations[0]?.id || null : null });
  };
  const close = () => { if (running.current || uncertain) return; generation.current++; setDraft(null); setEditing(null); setPreview(null); setError(''); retry.current = null; };
  const run = async (operation: () => Promise<void>, mutation = false, isRetry = false) => {
    if (running.current || uncertain && !isRetry) return;
    if (mutation) retryOperation.current = operation;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try { await operation(); setUncertain(false); retryOperation.current = null; } catch (failure) {
      setError(errorText(failure));
      const code = typeof failure === 'object' && failure !== null && 'code' in failure ? String(failure.code) : '';
      // A later denial does not prove the first unknown request was never
      // committed. Only a successful same-request receipt settles a replay.
      if (mutation) setUncertain(isRetry || !['revision_conflict', 'conflict', 'forbidden', 'unauthorized', 'invalid_input', 'invalid_destination'].includes(code));
    }
    finally { running.current = false; setBusy(false); }
  };
  const replace = (code: QrCodeSummary) => setCodes(current => [code, ...current.filter(row => row.id !== code.id || row.brandId !== code.brandId)]);
  const save = () => {
    if (uploadBusy || !draft || !dynamicEnabled || draft.kind !== 'dynamic' || !(editing ? capabilities.edit : capabilities.create)) return;
    const value = draft, key = JSON.stringify(['save', editing?.id, editing?.revision, value]);
    void run(async () => {
      const saved = await api.save(value, { ...(editing ? { id: editing.id, revision: editing.revision } : {}), requestId: requestId(key) });
      replace(saved); retry.current = null; generation.current++; setDraft(null); setEditing(null); setPreview(null); setNotice('QR-koden er gemt.');
    }, true);
  };
  const updateStatus = (code: QrCodeSummary, nextStatus: QrStatus) => {
    if (!(nextStatus === 'archived' ? capabilities.archive : capabilities.edit)) return;
    void run(async () => {
      replace(await api.setStatus(code.id, nextStatus, { brandId: code.brandId, revision: code.revision, requestId: requestId(JSON.stringify(['status', code.brandId, code.id, code.revision, nextStatus])) }));
      retry.current = null; setPendingArchive(null); setNotice('Status er opdateret.');
    }, true);
  };
  const renderPreview = () => {
    if (!draft || draft.kind === 'dynamic' && !dynamicEnabled) return;
    const value = draft, current = generation.current;
    void run(async () => {
      const result = await api.preview(value, editing ? { id: editing.id, revision: editing.revision } : {});
      if (current === generation.current) setPreview({ ...result, imageUrl: trustedAssetUrl(result.imageUrl, true) });
    });
  };
  const download = (format: 'png' | 'svg') => {
    if (!draft || !capabilities.export || draft.kind === 'dynamic' && !dynamicEnabled) return;
    const value = draft;
    void run(async () => {
      const result = await api.download(value, format, editing ? { id: editing.id, revision: editing.revision } : {}), link = document.createElement('a');
      link.href = trustedAssetUrl(result.url); link.download = result.filename.replace(/[\\/\u0000-\u001f]/g, '_'); link.rel = 'noopener';
      document.body.append(link); link.click(); link.remove(); setNotice('Download er klar.');
    });
  };
  const visible = codes.filter(code => (status === 'all' || code.status === status) && (!campaign || code.campaign === campaign) && `${code.name} ${code.destination} ${code.publicUrl || ''} ${code.campaign} ${code.tags.join(' ')}`.toLocaleLowerCase('da').includes(search.toLocaleLowerCase('da'))).sort((a, b) => sort === 'scans'
    ? (allTime?.[`${b.brandId}/${b.id}`]?.probableScans ?? -1) - (allTime?.[`${a.brandId}/${a.id}`]?.probableScans ?? -1) || a.name.localeCompare(b.name, 'da')
    : a.name.localeCompare(b.name, 'da'));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / 12) - 1));
  const rows = visible.slice(currentPage * 12, (currentPage + 1) * 12);
  const copyLink = async (code: QrCodeSummary) => {
    if (!code.publicUrl) return;
    try { await navigator.clipboard.writeText(code.publicUrl); setNotice('Det permanente QR-link er kopieret.'); }
    catch { setError('Linket kunne ikke kopieres. Markér og kopiér linket på kortet.'); }
  };
  const selectedBrand = brands.find(brand => brand.id === draft?.brandId);
  const dynamicNeedsSave = draft?.kind === 'dynamic' && (!dynamicEnabled || !editing || JSON.stringify(draft) !== JSON.stringify(draftOf(editing)));

  return <section aria-label="QR-koder" aria-busy={busy} className="qr-admin space-y-6" style={{ minWidth: 0 }}>
    <style>{QR_ADMIN_CSS}</style>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">QR-koder</h1><p className="text-sm text-muted-foreground">Opret koder til kampagner, borde og tryksager.</p></div>
      {(capabilities.create || !dynamicEnabled && capabilities.export) && <button type="button" className={`${buttonClass} qr-primary`} disabled={busy || uncertain || !defaultBrand} onClick={() => open()}>{dynamicEnabled ? 'Opret QR-kode' : 'Generér statisk QR-kode'}</button>}
    </header>
    {!dynamicEnabled && <p role="status" className="rounded-md border p-3">Dynamiske QR-koder er ikke aktiveret. Du kan generere statiske koder. Gemning, preview og download af dynamiske koder er midlertidigt lukket.</p>}
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3">{error}</p>}
    {notice && <p role="status" className="rounded-md border p-3">{notice}</p>}
    {busy && <p role="status">Arbejder…</p>}
    {uncertain && <div className="space-y-2"><p>Resultatet er usikkert. Prøv samme handling igen, før du ændrer felter eller starter en ny handling.</p><button type="button" className={buttonClass} disabled={busy} onClick={() => { if (retryOperation.current) void run(retryOperation.current, true, true); }}>Prøv samme handling igen</button></div>}
    {!brands.length && <p>Du har ingen tilgængelige brands. Kontakt en administrator for adgang.</p>}

    <div className="qr-summary" aria-label="Oversigt over indlæste koder">
      <div><span>QR-koder</span><strong>{codes.length}</strong></div><div><span>Aktive</span><strong>{codes.filter(code => code.status === 'active').length}</strong></div><div><span>På pause</span><strong>{codes.filter(code => code.status === 'paused').length}</strong></div>
      <p>Dit permanente link bevares,<br />når du ændrer destinationen.</p>
    </div>
    <div className="qr-toolbar">
      <label className="qr-search">Søg QR-koder<input type="search" placeholder="Navn, webadresse eller tag" className={fieldClass} value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>Status<select aria-label="Status" className={fieldClass} value={status} onChange={e => setStatusFilter(e.target.value as typeof status)}><option value="all">Alle</option>{Object.entries(STATUS_NAMES).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
      <label>Kampagnefilter<select aria-label="Kampagnefilter" className={fieldClass} value={campaign} onChange={e => setCampaign(e.target.value)}><option value="">Alle kampagner</option>{[...new Set(codes.map(code => code.campaign).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Sortering<select aria-label="Sortering" className={fieldClass} value={sort} onChange={e => setSort(e.target.value)}><option value="name">Navn A–Å</option><option value="scans">Flest sandsynlige scanninger</option></select></label>
      <div className="qr-view-toggle" role="group" aria-label="Visning"><button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>Liste</button><button type="button" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>Kort</button></div>
    </div>

    {draft && <form aria-label={editing ? 'Redigér QR-kode' : 'Ny QR-kode'} className="qr-editor space-y-4 rounded-lg border p-4" onSubmit={e => { e.preventDefault(); save(); }}>
      <p className="qr-eyebrow">INDHOLD OG DESIGN</p><h2 className="text-lg font-semibold">{editing ? 'Redigér QR-kode' : 'Ny QR-kode'}</h2>
      <fieldset disabled={busy || uncertain || uploadBusy} className="space-y-4" style={{ minWidth: 0 }}>
        <div style={gridStyle}>
          <label>Navn<input required maxLength={120} className={fieldClass} value={draft.name} onChange={e => change({ name: e.target.value })} /></label>
          <label>Brand<select aria-label="Brand" required className={fieldClass} disabled={!!editing} value={draft.brandId} onChange={e => { const brand = brands.find(candidate => candidate.id === e.target.value); change({ brandId: e.target.value, locationId: brand?.allowWholeBrand === false ? brand.locations[0]?.id || null : null }); }}>{brands.filter(brand => brand.allowWholeBrand !== false || brand.locations.length > 0).map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>
          <label>Placering<select aria-label="Placering" className={fieldClass} value={draft.locationId || ''} onChange={e => change({ locationId: e.target.value || null })}>{selectedBrand?.allowWholeBrand !== false && <option value="">Hele brandet</option>}{selectedBrand?.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label>Kodetype<select aria-label="Kodetype" className={fieldClass} disabled={!!editing} value={draft.kind} onChange={e => change({ kind: e.target.value as QrKind })}><option value="dynamic" disabled={!dynamicEnabled}>Dynamisk, med statistik</option><option value="static">Statisk, uden statistik</option></select></label>
          {draft.kind === 'static' && <label>Indholdstype<select aria-label="Indholdstype" className={fieldClass} value={draft.staticType} onChange={e => change({ staticType: e.target.value as QrStaticType, fields: e.target.value === 'wifi' ? { security: 'WPA' } : {} })}>{Object.entries(STATIC_NAMES).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>}
        </div>
        {(draft.kind === 'dynamic' || draft.staticType === 'url') && <label className="block">Webadresse<input required type="url" maxLength={2000} placeholder="https://" className={fieldClass} value={draft.destination} onChange={e => change({ destination: e.target.value })} /></label>}
        {draft.kind === 'static' && <div style={gridStyle}>{STATIC_FIELDS[draft.staticType].map(([key, label, type]) => <label key={key}>{label}{draft.staticType === 'wifi' && key === 'security'
          ? <select aria-label={label} className={fieldClass} value={draft.fields.security || 'WPA'} onChange={e => change({ fields: { ...draft.fields, security: e.target.value, ...(e.target.value === 'nopass' ? { password: '' } : {}) } })}><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">Åbent netværk</option></select>
          : <input type={type} maxLength={2000} disabled={draft.staticType === 'wifi' && key === 'password' && draft.fields.security === 'nopass'} required={key === 'text' || key === 'ssid' || key === 'name' || key === 'to' || key === 'phone'} autoComplete={type === 'password' ? 'new-password' : 'off'} className={fieldClass} value={draft.fields[key] || ''} onChange={e => change({ fields: { ...draft.fields, [key]: e.target.value } })} />}</label>)}</div>}
        <p className="text-sm text-muted-foreground">{draft.kind === 'dynamic' ? 'Destinationen kan ændres efter print. Statistik måler åbninger af QR-linket, ikke sikre personer eller kamerascanninger.' : 'Indholdet kan ikke ændres på en trykt kode. Statiske koder giver ingen scanningstatistik.'}</p>
        {draft.kind === 'static' && <p className="text-sm">Statiske koder genereres til download. Indholdet gemmes ikke i QR-oversigten.</p>}
        {draft.kind === 'dynamic' && <label className="block">Udløbsdato<input type="date" className={fieldClass} value={draft.expiresAt ? copenhagenDate(draft.expiresAt) : ''} onChange={e => change({ expiresAt: e.target.value ? copenhagenMidnight(e.target.value) : null })} /><span className="text-xs">Valgfrit. Koden udløber kl. 00.00 dansk tid på den valgte dato.</span></label>}
        <details className="qr-design" open><summary>Udseende</summary>
          <p className="qr-help">Vælg en farvestil, eller tilpas farverne. Logo og print kan forhåndsvises nedenfor på en gemt kode.</p>
          <div className="qr-presets" role="group" aria-label="Farvestile">{[{ name: 'Klassisk', dark: '#000000', light: '#ffffff' }, { name: 'Skovgrøn', dark: '#164e3b', light: '#ffffff' }, { name: 'Midnatsblå', dark: '#1c294c', light: '#ffffff' }, { name: 'Varm bordeaux', dark: '#701d35', light: '#fffaf2' }].map(preset => <button key={preset.name} type="button" aria-pressed={(draft.style || DEFAULT_STYLE).dark === preset.dark && (draft.style || DEFAULT_STYLE).light === preset.light} onClick={() => change({ style: { ...(draft.style || DEFAULT_STYLE), dark: preset.dark, light: preset.light } })}><span style={{ background: preset.light, color: preset.dark }}>▦</span>{preset.name}</button>)}</div>
          <div style={gridStyle}>
          <label>Størrelse i pixels<select aria-label="Størrelse i pixels" className={fieldClass} value={(draft.style || DEFAULT_STYLE).width} onChange={e => change({ style: { ...(draft.style || DEFAULT_STYLE), width: Number(e.target.value) } })}>{[256, 512, 1024, 2048].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
          <label>Kodefarve<input type="color" className={fieldClass} value={(draft.style || DEFAULT_STYLE).dark} onChange={e => change({ style: { ...(draft.style || DEFAULT_STYLE), dark: e.target.value } })} /></label>
          <label>Baggrundsfarve<input type="color" className={fieldClass} value={(draft.style || DEFAULT_STYLE).light} onChange={e => change({ style: { ...(draft.style || DEFAULT_STYLE), light: e.target.value } })} /></label>
          <label>Fejlkorrektion<select aria-label="Fejlkorrektion" className={fieldClass} disabled={!!draft.style?.logoBase64} value={draft.style?.logoBase64 ? 'H' : (draft.style || DEFAULT_STYLE).errorCorrectionLevel} onChange={e => change({ style: { ...(draft.style || DEFAULT_STYLE), errorCorrectionLevel: e.target.value as 'L' | 'M' | 'Q' | 'H' } })}>{['L', 'M', 'Q', 'H'].map(level => <option key={level} value={level}>{level}</option>)}</select></label>
        </div><p className="text-xs">Minimum fire modulers lys kant bevares. Eksporten kontrollerer kontrast og læsbarhed.</p></details>
        <div style={gridStyle}>
          <label>Kampagne<input maxLength={120} className={fieldClass} value={draft.campaign} onChange={e => change({ campaign: e.target.value })} /></label>
          <label>Tags, adskilt med komma<input maxLength={500} className={fieldClass} value={draft.tags.join(', ')} onChange={e => change({ tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} /></label>
        </div>
        {(draft.kind === 'dynamic' || draft.staticType === 'url') && <details><summary>Kampagnesporing (UTM)</summary><div style={gridStyle}>{(['source', 'medium', 'campaign', 'content', 'term'] as const).map(key => <label key={key}>UTM {key}<input maxLength={120} className={fieldClass} value={draft.utm[key]} onChange={e => change({ utm: { ...draft.utm, [key]: e.target.value } })} /></label>)}</div></details>}
        <div className="flex flex-wrap gap-2">
          {draft.kind === 'dynamic' && (editing ? capabilities.edit : capabilities.create) && <button type="submit" disabled={!dynamicEnabled} className={`${buttonClass} qr-primary`}>Gem QR-kode</button>}
          <button type="button" className={buttonClass} disabled={dynamicNeedsSave} onClick={renderPreview}>Vis eksempel</button>
          {capabilities.export && <><button type="button" className={buttonClass} disabled={dynamicNeedsSave} onClick={() => download('png')}>Download PNG</button><button type="button" className={buttonClass} disabled={dynamicNeedsSave} onClick={() => download('svg')}>Download SVG</button></>}
          <button type="button" className={buttonClass} onClick={close}>Annullér</button>
        </div>
        {dynamicNeedsSave && dynamicEnabled && <p className="text-sm">Gem koden og åbn den igen før preview eller download. Det sikrer, at printet bruger det permanente link.</p>}
      </fieldset>
      {preview && <figure className="space-y-2"><img src={preview.imageUrl} alt="Eksempel på QR-kode" width={256} height={256} style={{ maxWidth: '100%', height: 'auto' }} /><figcaption className="break-all text-xs">{draft.kind === 'dynamic' ? 'Preview. Brug den gemte kodes permanente link ved print.' : preview.payload}</figcaption></figure>}
      {capabilities.export && !busy && !uncertain && renderExtras?.(draft, editing ? { id: editing.id, revision: editing.revision } : {}, change, setUploadBusy, dynamicNeedsSave)}
    </form>}

    {pendingArchive && <div role="dialog" aria-labelledby="archive-title" className="space-y-3 rounded-lg border p-4"><h2 id="archive-title">Arkivér QR-kode</h2><p>Koden {pendingArchive.name} vil ikke længere sende kunder videre. Trykte koder bliver berørt.</p><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || uncertain} onClick={() => updateStatus(pendingArchive, 'archived')}>Bekræft arkivering</button><button type="button" className={buttonClass} disabled={busy || uncertain} onClick={() => { setPendingArchive(null); setError(''); retry.current = null; }}>Fortryd</button></div></div>}
    <div className="qr-list-heading"><h2>Alle QR-koder</h2><span>{visible.length} {visible.length === 1 ? 'kode' : 'koder'}</span></div>
    <ul className={`qr-catalogue qr-catalogue-${layout}`} aria-label="Gemte QR-koder">
      {rows.map(code => <li key={`${code.brandId}/${code.id}`} className="qr-card" style={{ overflowWrap: 'anywhere' }}>
        <QrThumbnail code={code} api={api} enabled={dynamicEnabled && code.status !== 'archived'} />
        <div className="qr-card-content"><h2>{code.name}</h2><div className="qr-card-meta"><span>{brands.find(brand => brand.id === code.brandId)?.name || code.brandId}</span><span>{code.kind === 'dynamic' ? 'Dynamisk' : 'Statisk'}</span><span className={`qr-badge qr-badge-${code.status}`}>{STATUS_NAMES[code.status]}</span></div>
          {code.publicUrl && <div className="qr-permanent"><span>{code.publicUrl.replace('https://', '')}</span><button type="button" className="qr-copy" aria-label={`Kopiér link til ${code.name}`} onClick={() => { void copyLink(code); }}>Kopiér</button></div>}
          <p className="qr-destination"><span>Destination</span> {code.destination}</p>
          {(code.campaign || code.tags.length > 0) && <p className="qr-card-tags">{code.campaign}{code.tags.length ? ` · ${code.tags.join(', ')}` : ''}</p>}
        </div>
        <div className="qr-card-side"><div className="qr-card-actions">
          {onAnalytics && analyticsCodeKeys.includes(`${code.brandId}/${code.id}`) && code.kind === 'dynamic' && <button type="button" className={buttonClass} aria-label={`Statistik for ${code.name}`} onClick={() => onAnalytics(code)}>Statistik</button>}
          {capabilities.edit && code.status !== 'archived' && <button type="button" className={buttonClass} disabled={busy || uncertain} aria-label={`Redigér ${code.name}`} onClick={() => open(code)}>Redigér / design</button>}
          {!capabilities.edit && capabilities.export && code.status !== 'archived' && <button type="button" className={buttonClass} disabled={busy || uncertain} aria-label={`Vis ${code.name}`} onClick={() => open(code)}>Vis / download</button>}
          {(capabilities.create || capabilities.edit || capabilities.archive) && <details className="qr-action-menu"><summary aria-label={`Flere handlinger for ${code.name}`}>•••</summary><div>
          {capabilities.create && dynamicEnabled && code.kind === 'dynamic' && <button type="button" className={buttonClass} disabled={busy || uncertain} aria-label={`Duplikér ${code.name}`} onClick={() => open(code, true)}>Duplikér</button>}
          {capabilities.edit && code.kind === 'dynamic' && code.status !== 'archived' && <button type="button" className={buttonClass} disabled={busy || uncertain} aria-label={`${code.status === 'active' ? 'Sæt på pause' : 'Aktivér'} ${code.name}`} onClick={() => updateStatus(code, code.status === 'active' ? 'paused' : 'active')}>{code.status === 'active' ? 'Sæt på pause' : 'Aktivér'}</button>}
          {capabilities.archive && code.kind === 'dynamic' && code.status !== 'archived' && <button type="button" className={`${buttonClass} qr-danger`} disabled={busy || uncertain} aria-label={`Arkivér ${code.name}`} onClick={() => { setPendingArchive(code); setError(''); }}>Arkivér</button>}
          </div></details>}
        </div>
        {allTime && Object.prototype.hasOwnProperty.call(allTime, `${code.brandId}/${code.id}`) && <div className="qr-card-count"><strong>{allTime[`${code.brandId}/${code.id}`]?.probableScans.toLocaleString('da-DK') ?? 'Ukendt'}</strong><span>Sandsynlige scanninger<br />Hele levetiden</span></div>}
        </div>
      </li>)}
    </ul>
    {visible.length > 12 && <nav className="qr-pagination" aria-label="Sider med QR-koder"><button type="button" className={buttonClass} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Forrige</button><span>Side {currentPage + 1} af {Math.ceil(visible.length / 12)}</span><button type="button" className={buttonClass} disabled={(currentPage + 1) * 12 >= visible.length} onClick={() => setPage(currentPage + 1)}>Næste</button></nav>}
    {!visible.length && <p>Ingen QR-koder matcher dine filtre.</p>}
  </section>;
}

const QR_ADMIN_CSS = `
.qr-admin{color:#1c294c;font-family:inherit;--qr-line:#e1e7ee;--qr-muted:#62718b;--qr-accent:#087da0}
.qr-admin header{padding:8px 0 18px}.qr-admin h1{font-size:28px;letter-spacing:-.6px}.qr-admin header p{color:var(--qr-muted);margin-top:6px}
.qr-admin .qr-button{background:#fff;border:1px solid var(--qr-line);border-radius:9px;min-height:40px;color:#253653;font-weight:600;cursor:pointer;padding:9px 13px;font-size:13px}
.qr-admin .qr-button:hover:not(:disabled){background:#f0f7fa;border-color:#a3c9d4}.qr-admin button:disabled{cursor:not-allowed;opacity:.5}.qr-admin .qr-primary{background:#1c294c;color:white;border-color:#1c294c;border-radius:24px;padding:11px 22px}
.qr-admin :is(button,input,select,summary):focus-visible{outline:3px solid #087da0;outline-offset:3px}
.qr-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(200px,1.5fr);gap:16px;padding:22px 26px;background:#f3f7fa;border:1px solid var(--qr-line);border-radius:16px}
.qr-summary>div{display:flex;flex-direction:column;gap:5px}.qr-summary span{font-size:13px;color:var(--qr-muted)}.qr-summary strong{font-size:28px;font-weight:700;line-height:1.2}.qr-summary p{font-size:13px;align-self:center;line-height:1.7;color:var(--qr-muted);text-align:right}
.qr-toolbar{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:8px 0}.qr-toolbar label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:600;min-width:130px}.qr-toolbar .qr-search{flex:1;min-width:210px}.qr-toolbar :is(input,select){background:#fff;border:1px solid var(--qr-line);min-height:42px;border-radius:8px;max-width:100%;padding:9px 12px;color:#334155}.qr-view-toggle{display:flex;border:1px solid var(--qr-line);border-radius:9px;padding:4px;min-height:42px;background:#eef3f8}.qr-view-toggle button{padding:5px 12px;border-radius:6px;font-size:13px}.qr-view-toggle button[aria-pressed=true]{background:#fff;box-shadow:0 1px 4px #1c294c15}
.qr-list-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.qr-list-heading h2{font-size:18px;font-weight:700}.qr-list-heading>span{color:var(--qr-muted);font-size:13px}
.qr-catalogue{display:grid;gap:14px;padding:0;list-style:none;margin:0}.qr-catalogue-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.qr-card{display:flex;gap:20px;padding:20px;border:1px solid var(--qr-line);border-radius:16px;box-shadow:0 2px 5px #1c294c05;background:#fff;min-width:0;position:relative}.qr-card:focus-within{z-index:2}.qr-thumbnail{width:112px;height:112px;flex:0 0 112px;display:grid;place-items:center;background:#f6f8fa;border:1px solid #edf1f5;border-radius:10px;padding:7px}.qr-thumbnail img{width:96px;height:96px;object-fit:contain}.qr-thumbnail-placeholder{font-size:12px;color:#79879c;text-align:center;letter-spacing:1px}.qr-card-content{flex:1;min-width:0}.qr-card h2{font-size:16px;line-height:1.5;font-weight:700;margin:0 0 6px}.qr-card-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--qr-muted);font-size:12px}.qr-badge{padding:3px 8px;border-radius:5px}.qr-badge-active{background:#dcf9ec;color:#14764c}.qr-badge-paused{background:#edf0f4;color:#526174}.qr-badge-archived{background:#fff0ee;color:#9b4034}.qr-permanent{display:flex;align-items:center;gap:8px;margin-top:10px;color:#506488;font-size:12px}.qr-copy{color:#087da0;font-weight:600;padding:4px;flex-shrink:0}.qr-destination{font-size:12px;color:#62718b;margin:5px 0;line-height:1.6}.qr-destination>span{font-weight:600;color:#087da0;margin-right:4px}.qr-card-tags{font-size:12px;color:#62718b;margin-top:8px}.qr-card-side{display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;gap:18px}.qr-card-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.qr-card-count{display:flex;align-items:center;gap:8px}.qr-card-count strong{font-size:24px}.qr-card-count span{font-size:11px;color:#62718b;line-height:1.5}
.qr-action-menu{position:relative}.qr-action-menu summary{list-style:none;padding:9px;cursor:pointer;border-radius:8px;letter-spacing:2px}.qr-action-menu summary::-webkit-details-marker{display:none}.qr-action-menu[open]>div{position:absolute;right:0;top:100%;min-width:180px;background:#fff;box-shadow:0 5px 22px #1c294c20;border:1px solid var(--qr-line);border-radius:9px;padding:6px;z-index:5}.qr-action-menu .qr-button{display:block;width:100%;text-align:left;border:0;border-radius:5px}.qr-action-menu .qr-danger{color:#b42318}.qr-catalogue-grid .qr-card{flex-wrap:wrap}.qr-catalogue-grid .qr-card-side{width:100%;flex-direction:row;align-items:center;border-top:1px solid #edf1f5;padding-top:12px}
.qr-editor{background:#f7f9fc;border:1px solid var(--qr-line);border-radius:16px;padding:26px}.qr-eyebrow{font-size:11px;font-weight:700;letter-spacing:1.8px;color:#087da0}.qr-editor h2{font-size:23px}.qr-editor label{font-size:13px;font-weight:600;color:#344360}.qr-editor :is(input,select){margin-top:6px;min-height:42px;border:1px solid #d5dfea;border-radius:7px;background:#fff;padding:10px 12px;max-width:100%}.qr-editor input[type=color]{padding:4px;height:42px}.qr-editor details:not(.qr-action-menu){background:#fff;border:1px solid var(--qr-line);border-radius:12px;padding:18px}.qr-editor summary{font-weight:700;cursor:pointer;margin-bottom:12px}.qr-help{font-size:13px;color:var(--qr-muted);margin:10px 0 18px}.qr-presets{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 22px}.qr-presets button{border:1px solid var(--qr-line);border-radius:9px;padding:10px;min-width:100px;font-size:12px;display:flex;align-items:center;gap:8px}.qr-presets button[aria-pressed=true]{border:2px solid #087da0;background:#ecf8fc;padding:9px}.qr-presets span{font-size:28px;width:36px;line-height:36px;text-align:center;border-radius:5px}.qr-pagination{display:flex;justify-content:center;align-items:center;gap:18px;font-size:13px}
@media(max-width:1100px){.qr-card{flex-wrap:wrap}.qr-card-side{width:100%;flex-direction:row;align-items:center;border-top:1px solid #edf1f5;padding-top:12px}.qr-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.qr-summary p{display:none}}
@media(max-width:640px){.qr-summary{padding:16px;gap:8px}.qr-summary strong{font-size:23px}.qr-toolbar{gap:10px}.qr-toolbar label{min-width:0;flex:1 1 42%}.qr-toolbar .qr-search{flex:1 1 100%;min-width:0}.qr-toolbar select{width:100%;font-size:12px}.qr-catalogue-grid{grid-template-columns:1fr}.qr-card{padding:15px;gap:12px}.qr-thumbnail{width:80px;height:80px;flex-basis:80px}.qr-thumbnail img{width:66px;height:66px}.qr-card-side{gap:12px;flex-wrap:wrap}.qr-card-actions{gap:5px}.qr-card .qr-button{padding:8px 10px;font-size:12px}.qr-editor{padding:16px}.qr-editor details:not(.qr-action-menu){padding:14px}.qr-permanent{flex-wrap:wrap}.qr-destination{overflow-wrap:anywhere}}
`;
