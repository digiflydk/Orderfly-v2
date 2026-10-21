'use client';

import React, { useRef, useState } from 'react';

export type QrKind = 'dynamic' | 'static';
export type QrStaticType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'phone' | 'sms';
export type QrStatus = 'active' | 'paused' | 'archived';
export type QrDraft = {
  name: string; brandId: string; locationId: string | null; kind: QrKind;
  destination: string; staticType: QrStaticType; fields: Record<string, string>;
  campaign: string; tags: string[];
  utm: { source: string; medium: string; campaign: string; content: string; term: string };
  expiresAt?: number | null;
  style?: { width: number; dark: string; light: string; errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'; margin: number };
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
  renderExtras?: (draft: QrDraft, context: { id?: string; revision?: string }) => React.ReactNode };

const blank = (brandId = ''): QrDraft => ({ name: '', brandId, locationId: null, kind: 'dynamic', destination: '', staticType: 'url', fields: {}, campaign: '', tags: [], utm: { source: '', medium: 'qr', campaign: '', content: '', term: '' } });
const fieldClass = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const buttonClass = 'rounded-md border px-3 py-2 text-sm disabled:opacity-50';
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

export function QrManager({ brands, initialCodes, capabilities, api, dynamicEnabled = true, renderExtras }: QrManagerProps) {
  const [codes, setCodes] = useState(initialCodes);
  const [search, setSearch] = useState('');
  const [status, setStatusFilter] = useState<'all' | QrStatus>('all');
  const [draft, setDraft] = useState<QrDraft | null>(null);
  const [editing, setEditing] = useState<QrCodeSummary | null>(null);
  const [preview, setPreview] = useState<QrPreview | null>(null);
  const [pendingArchive, setPendingArchive] = useState<QrCodeSummary | null>(null);
  const [busy, setBusy] = useState(false);
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
    if (!draft || !dynamicEnabled || draft.kind !== 'dynamic' || !(editing ? capabilities.edit : capabilities.create)) return;
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
  const visible = codes.filter(code => (status === 'all' || code.status === status) && `${code.name} ${code.campaign} ${code.tags.join(' ')}`.toLocaleLowerCase('da').includes(search.toLocaleLowerCase('da')));
  const selectedBrand = brands.find(brand => brand.id === draft?.brandId);
  const dynamicNeedsSave = draft?.kind === 'dynamic' && (!dynamicEnabled || !editing || JSON.stringify(draft) !== JSON.stringify(draftOf(editing)));

  return <section aria-label="QR-koder" aria-busy={busy} className="space-y-6" style={{ minWidth: 0 }}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">QR-koder</h1><p className="text-sm text-muted-foreground">Opret koder til kampagner, borde og tryksager.</p></div>
      {(capabilities.create || !dynamicEnabled && capabilities.export) && <button type="button" className={buttonClass} disabled={busy || uncertain || !defaultBrand} onClick={() => open()}>{dynamicEnabled ? 'Opret QR-kode' : 'Generér statisk QR-kode'}</button>}
    </header>
    {!dynamicEnabled && <p role="status" className="rounded-md border p-3">Dynamiske QR-koder er ikke aktiveret. Du kan generere statiske koder. Gemning, preview og download af dynamiske koder er midlertidigt lukket.</p>}
    {error && <p role="alert" className="rounded-md bg-destructive/10 p-3">{error}</p>}
    {notice && <p role="status" className="rounded-md border p-3">{notice}</p>}
    {busy && <p role="status">Arbejder…</p>}
    {uncertain && <div className="space-y-2"><p>Resultatet er usikkert. Prøv samme handling igen, før du ændrer felter eller starter en ny handling.</p><button type="button" className={buttonClass} disabled={busy} onClick={() => { if (retryOperation.current) void run(retryOperation.current, true, true); }}>Prøv samme handling igen</button></div>}
    {!brands.length && <p>Du har ingen tilgængelige brands. Kontakt en administrator for adgang.</p>}

    <div style={gridStyle}>
      <label className="space-y-1">Søg QR-koder<input type="search" className={fieldClass} value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label className="space-y-1">Status<select aria-label="Status" className={fieldClass} value={status} onChange={e => setStatusFilter(e.target.value as typeof status)}><option value="all">Alle</option>{Object.entries(STATUS_NAMES).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>
    </div>

    {draft && <form aria-label={editing ? 'Redigér QR-kode' : 'Ny QR-kode'} className="space-y-4 rounded-lg border p-4" onSubmit={e => { e.preventDefault(); save(); }}>
      <h2 className="text-lg font-semibold">{editing ? 'Redigér QR-kode' : 'Ny QR-kode'}</h2>
      <fieldset disabled={busy || uncertain} className="space-y-4" style={{ minWidth: 0 }}>
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
        <details><summary>Udseende</summary><div style={gridStyle}>
          <label>Størrelse i pixels<select aria-label="Størrelse i pixels" className={fieldClass} value={(draft.style || DEFAULT_STYLE).width} onChange={e => change({ style: { ...(draft.style || DEFAULT_STYLE), width: Number(e.target.value) } })}>{[256, 512, 1024, 2048].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
          <label>Kodefarve<input type="color" className={fieldClass} value={(draft.style || DEFAULT_STYLE).dark} onChange={e => change({ style: { ...(draft.style || DEFAULT_STYLE), dark: e.target.value } })} /></label>
          <label>Baggrundsfarve<input type="color" className={fieldClass} value={(draft.style || DEFAULT_STYLE).light} onChange={e => change({ style: { ...(draft.style || DEFAULT_STYLE), light: e.target.value } })} /></label>
          <label>Fejlkorrektion<select aria-label="Fejlkorrektion" className={fieldClass} value={(draft.style || DEFAULT_STYLE).errorCorrectionLevel} onChange={e => change({ style: { ...(draft.style || DEFAULT_STYLE), errorCorrectionLevel: e.target.value as 'L' | 'M' | 'Q' | 'H' } })}>{['L', 'M', 'Q', 'H'].map(level => <option key={level} value={level}>{level}</option>)}</select></label>
        </div><p className="text-xs">Minimum fire modulers lys kant bevares. Eksporten kontrollerer kontrast og læsbarhed.</p></details>
        <div style={gridStyle}>
          <label>Kampagne<input maxLength={120} className={fieldClass} value={draft.campaign} onChange={e => change({ campaign: e.target.value })} /></label>
          <label>Tags, adskilt med komma<input maxLength={500} className={fieldClass} value={draft.tags.join(', ')} onChange={e => change({ tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean) })} /></label>
        </div>
        {(draft.kind === 'dynamic' || draft.staticType === 'url') && <details><summary>Kampagnesporing (UTM)</summary><div style={gridStyle}>{(['source', 'medium', 'campaign', 'content', 'term'] as const).map(key => <label key={key}>UTM {key}<input maxLength={120} className={fieldClass} value={draft.utm[key]} onChange={e => change({ utm: { ...draft.utm, [key]: e.target.value } })} /></label>)}</div></details>}
        <div className="flex flex-wrap gap-2">
          {draft.kind === 'dynamic' && (editing ? capabilities.edit : capabilities.create) && <button type="submit" disabled={!dynamicEnabled} className={buttonClass}>Gem QR-kode</button>}
          <button type="button" className={buttonClass} disabled={dynamicNeedsSave} onClick={renderPreview}>Vis eksempel</button>
          {capabilities.export && <><button type="button" className={buttonClass} disabled={dynamicNeedsSave} onClick={() => download('png')}>Download PNG</button><button type="button" className={buttonClass} disabled={dynamicNeedsSave} onClick={() => download('svg')}>Download SVG</button></>}
          <button type="button" className={buttonClass} onClick={close}>Annullér</button>
        </div>
        {dynamicNeedsSave && dynamicEnabled && <p className="text-sm">Gem koden og åbn den igen før preview eller download. Det sikrer, at printet bruger det permanente link.</p>}
      </fieldset>
      {preview && <figure className="space-y-2"><img src={preview.imageUrl} alt="Eksempel på QR-kode" width={256} height={256} style={{ maxWidth: '100%', height: 'auto' }} /><figcaption className="break-all text-xs">{draft.kind === 'dynamic' ? 'Preview. Brug den gemte kodes permanente link ved print.' : preview.payload}</figcaption></figure>}
      {capabilities.export && !dynamicNeedsSave && !busy && !uncertain && renderExtras?.(draft, editing ? { id: editing.id, revision: editing.revision } : {})}
    </form>}

    {pendingArchive && <div role="dialog" aria-labelledby="archive-title" className="space-y-3 rounded-lg border p-4"><h2 id="archive-title">Arkivér QR-kode</h2><p>Koden {pendingArchive.name} vil ikke længere sende kunder videre. Trykte koder bliver berørt.</p><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={busy || uncertain} onClick={() => updateStatus(pendingArchive, 'archived')}>Bekræft arkivering</button><button type="button" className={buttonClass} disabled={busy || uncertain} onClick={() => { setPendingArchive(null); setError(''); retry.current = null; }}>Fortryd</button></div></div>}
    <ul className="space-y-3" aria-label="Gemte QR-koder" style={{ padding: 0, listStyle: 'none' }}>
      {visible.map(code => <li key={`${code.brandId}/${code.id}`} className="rounded-lg border p-4" style={{ overflowWrap: 'anywhere' }}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{code.name}</h2><p className="text-sm">{brands.find(brand => brand.id === code.brandId)?.name || code.brandId} · {STATUS_NAMES[code.status]} · {code.kind === 'dynamic' ? 'Dynamisk' : 'Statisk'}</p><p className="text-sm text-muted-foreground">{code.campaign}{code.tags.length ? ` · ${code.tags.join(', ')}` : ''}</p></div><div className="flex flex-wrap gap-2">
        {capabilities.edit && code.status !== 'archived' && <button type="button" className={buttonClass} disabled={busy || uncertain} aria-label={`Redigér ${code.name}`} onClick={() => open(code)}>Redigér</button>}
        {!capabilities.edit && capabilities.export && code.status !== 'archived' && <button type="button" className={buttonClass} disabled={busy || uncertain} aria-label={`Vis ${code.name}`} onClick={() => open(code)}>Vis</button>}
        {capabilities.create && dynamicEnabled && code.kind === 'dynamic' && <button type="button" className={buttonClass} disabled={busy || uncertain} aria-label={`Duplikér ${code.name}`} onClick={() => open(code, true)}>Duplikér</button>}
        {capabilities.edit && code.kind === 'dynamic' && code.status !== 'archived' && <button type="button" className={buttonClass} disabled={busy || uncertain} aria-label={`${code.status === 'active' ? 'Sæt på pause' : 'Aktivér'} ${code.name}`} onClick={() => updateStatus(code, code.status === 'active' ? 'paused' : 'active')}>{code.status === 'active' ? 'Sæt på pause' : 'Aktivér'}</button>}
        {capabilities.archive && code.kind === 'dynamic' && code.status !== 'archived' && <button type="button" className={buttonClass} disabled={busy || uncertain} aria-label={`Arkivér ${code.name}`} onClick={() => { setPendingArchive(code); setError(''); }}>Arkivér</button>}
      </div></div></li>)}
    </ul>
    {!visible.length && <p>Ingen QR-koder matcher dine filtre.</p>}
  </section>;
}
