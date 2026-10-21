'use client';

import React, { useRef, useState } from 'react';
import type { QrBulkEntry, QrBulkPreview } from '@/lib/qr/bulk';
import type { QrBrandChoice, QrCodeSummary } from './qr-manager';

export type QrBulkToolsPreview = Omit<QrBulkPreview, 'plan'> & { plan: (NonNullable<QrBulkPreview['plan']> & { sha256: string }) | null };
export type QrBulkToolsApi = {
  preview: (brandId: string, csv: string) => Promise<QrBulkToolsPreview>;
  commit: (brandId: string, input: { canonical: string; sha256: string; requestId: string }) => Promise<{ records: QrCodeSummary[] }>;
};
export type QrBulkToolsProps = { brands: QrBrandChoice[]; api: QrBulkToolsApi; onCommitted?: (records: QrCodeSummary[]) => void | Promise<void> };
const MAX_BYTES = 128 * 1024;
const MAX_ROWS = 100;
const inputClass = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const actionClass = 'rounded-md border px-3 py-2 text-sm disabled:opacity-50';
const HEADERS = 'name,destination,brand_id,location_id,campaign,tags,utm_source,utm_medium,utm_campaign,utm_term,utm_content';
const ERROR_NAMES: Record<string, string> = {
  invalid_csv: 'CSV-formatet er ugyldigt.', too_large: 'CSV-filen må højst være 128 KB.', too_many_rows: 'Der må højst være 100 datarækker.',
  invalid_header: 'Kolonneoverskrifterne er ugyldige eller mangler.', invalid_field: 'Feltets indhold er ugyldigt.', forbidden_scope: 'Brand eller placering er ikke tilladt.',
  invalid_destination: 'Webadressen er ugyldig eller ikke tilladt.', duplicate_row: 'Rækken har samme navn og placering som en anden række.',
};
const FIELD_NAMES: Record<string, string> = { csv: 'CSV', header: 'Kolonner', name: 'Navn', destination: 'Webadresse', brand_id: 'Brand', location_id: 'Placering', campaign: 'Kampagne', tags: 'Tags', source: 'UTM source', medium: 'UTM medium', term: 'UTM term', content: 'UTM content', utm: 'UTM', utm_source: 'UTM source', utm_medium: 'UTM medium', utm_campaign: 'UTM campaign', utm_term: 'UTM term', utm_content: 'UTM content' };
type PendingCommit = { brandId: string; canonical: string; sha256: string; requestId: string; count: number };
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const permitted = (brand: QrBrandChoice, entry: QrBulkEntry) => entry.brandId === brand.id && (entry.locationId === null ? brand.allowWholeBrand !== false : brand.locations.some(location => location.id === entry.locationId));

async function checkedPreview(result: QrBulkToolsPreview, brand: QrBrandChoice): Promise<QrBulkToolsPreview> {
  if (!result || typeof result.ok !== 'boolean' || !Array.isArray(result.rows) || result.rows.length > MAX_ROWS || !Array.isArray(result.errors)) throw new Error('invalid_preview');
  if (!result.ok || result.errors.length) return { ...result, ok: false, plan: null };
  const plan = result.plan;
  if (!plan || plan.schemaVersion !== 1 || typeof plan.canonical !== 'string' || plan.canonical.length > MAX_BYTES * 3 || !/^[a-f0-9]{64}$/.test(plan.sha256)
    || !Array.isArray(plan.entries) || plan.entries.length < 1 || plan.entries.length > MAX_ROWS || result.rows.length !== plan.entries.length) throw new Error('invalid_preview');
  if (!plan.entries.every(entry => object(entry) && typeof entry.name === 'string' && typeof entry.destination === 'string'
    && typeof entry.brandId === 'string' && (entry.locationId === null || typeof entry.locationId === 'string') && permitted(brand, entry))) throw new Error('forbidden_preview');
  const canonical = JSON.parse(plan.canonical);
  if (!object(canonical) || canonical.schemaVersion !== 1 || JSON.stringify(canonical.entries) !== JSON.stringify(plan.entries)
    || JSON.stringify(result.rows.map(row => row.entry)) !== JSON.stringify(plan.entries)) throw new Error('invalid_preview');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plan.canonical));
  const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== plan.sha256) throw new Error('invalid_preview');
  return result;
}

/** Presentation only. Preview/commit authorization and atomicity are server gates. */
export function QrBulkTools({ brands, api, onCommitted }: QrBulkToolsProps) {
  const available = brands.filter(brand => brand.allowWholeBrand !== false || brand.locations.length > 0);
  const [brandId, setBrandId] = useState(available[0]?.id || '');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<QrBulkToolsPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshError, setRefreshError] = useState(false);
  const running = useRef(false);
  const generation = useRef(0);
  const pending = useRef<PendingCommit | null>(null);
  const brand = available.find(value => value.id === brandId);
  const locked = busy || uncertain;
  const reset = () => { generation.current++; setPreview(null); setConfirmed(false); setError(''); setNotice(''); setRefreshError(false); pending.current = null; };
  const changeCsv = (value: string) => { if (running.current || uncertain) return; reset(); setCsv(value); };
  const template = `${HEADERS}\nBord 1,https://example.com/menu,${brandId},${brand?.allowWholeBrand === false ? brand.locations[0]?.id || '' : ''},Oktober,bord|restaurant,restaurant,qr,oktober,,bord-1\n`;

  const readFile = async (file: File | undefined) => {
    if (!file || running.current || uncertain) return;
    reset(); running.current = true; setBusy(true);
    try {
      if (!file.size || file.size > MAX_BYTES) throw new Error('file_size');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      setCsv(text);
    } catch { setError('Filen skal være gyldig UTF-8 og mellem 1 byte og 128 KB. Dine tidligere CSV-data er bevaret.'); }
    finally { running.current = false; setBusy(false); }
  };
  const inspect = async () => {
    if (running.current || uncertain) return;
    if (!brand || !csv.trim()) { setError('Vælg et brand og indsæt CSV-data før preview.'); return; }
    if (new TextEncoder().encode(csv).length > MAX_BYTES) { setError('CSV-data må højst fylde 128 KB.'); return; }
    const current = ++generation.current; running.current = true; setBusy(true); setError(''); setNotice(''); setPreview(null); setConfirmed(false); pending.current = null;
    try { const result = await checkedPreview(await api.preview(brand.id, csv), brand); if (generation.current === current) setPreview(result); }
    catch { if (generation.current === current) setError('CSV-preview kunne ikke valideres. Ingen koder er oprettet. Kontrollér data og adgang, og prøv igen.'); }
    finally { running.current = false; setBusy(false); }
  };
  const performCommit = async (request: PendingCommit) => {
    if (running.current) return;
    const wasUncertain = uncertain;
    running.current = true; setBusy(true); setError(''); setNotice(''); setRefreshError(false);
    try {
      const result = await api.commit(request.brandId, { canonical: request.canonical, sha256: request.sha256, requestId: request.requestId });
      if (!result || !Array.isArray(result.records) || result.records.length !== request.count || !result.records.every(record => record && typeof record.id === 'string' && typeof record.revision === 'string' && record.brandId === request.brandId)) throw new Error('invalid_commit_reply');
      pending.current = null; setUncertain(false); setPreview(null); setConfirmed(false); setCsv(''); setNotice(`${result.records.length} QR-koder er oprettet.`);
      try { await onCommitted?.(result.records); } catch { setRefreshError(true); }
    } catch (failure) {
      const code = object(failure) && 'code' in failure ? String(failure.code) : '';
      // A denial on replay does not settle the outcome of the original unknown
      // request. Only a successful receipt may clear that uncertainty.
      const definitive = !wasUncertain && ['invalid_input', 'forbidden', 'unauthorized', 'conflict', 'revision_conflict'].includes(code);
      setUncertain(!definitive);
      if (definitive) { pending.current = null; setError(code === 'forbidden' || code === 'unauthorized' ? 'Du har ikke adgang til importen. Ingen nye koder blev oprettet af denne handling.' : 'Importen blev afvist. Kontrollér CSV-data og lav et nyt preview.'); setPreview(null); setConfirmed(false); }
      else setError('Importens resultat er usikkert. Brug samme import igen, før du ændrer data eller starter en ny import.');
    } finally { running.current = false; setBusy(false); }
  };
  const commit = () => {
    if (running.current || uncertain || !confirmed || !brand || !preview?.ok || preview.errors.length || !preview.plan) return;
    const request: PendingCommit = { brandId: brand.id, canonical: preview.plan.canonical, sha256: preview.plan.sha256, requestId: crypto.randomUUID(), count: preview.plan.entries.length };
    pending.current = request; void performCommit(request);
  };
  const count = preview?.plan?.entries.length || 0;

  return <section aria-label="Importér QR-koder fra CSV" aria-busy={busy} className="space-y-4 rounded-lg border p-4" style={{ minWidth: 0 }}>
    <h2 className="text-xl font-semibold">Importér QR-koder fra CSV</h2>
    <p className="text-sm text-muted-foreground">Højst 100 dynamiske koder for ét brand pr. import. Hele importen afvises, hvis en række har fejl.</p>
    {!available.length && <p>Ingen brands med tilladt placering er tilgængelige.</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {refreshError && <p role="alert">Koderne er oprettet, men oversigten kunne ikke opdateres. Importér ikke igen. Genindlæs oversigten.</p>}
    {busy && <p role="status">Arbejder…</p>}
    {uncertain && <button type="button" className={actionClass} disabled={busy} onClick={() => { if (pending.current) void performCommit(pending.current); }}>Prøv samme import igen</button>}
    <fieldset disabled={locked} className="space-y-4" style={{ minWidth: 0 }}>
      <label className="block">Brand<select aria-label="Brand til CSV-import" className={inputClass} value={brandId} onChange={event => { if (!locked) { reset(); setBrandId(event.target.value); } }}>{available.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
      <label className="block">CSV-fil<input aria-label="CSV-fil" className={inputClass} type="file" accept=".csv,text/csv" onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <label className="block">CSV-data<textarea aria-label="CSV-data" className={inputClass} rows={8} spellCheck={false} value={csv} onChange={event => changeCsv(event.target.value)} /></label>
      <p className="text-xs">UTF-8, komma som separator og højst 128 KB. Tags adskilles med |. Brand-ID og placering kontrolleres igen på serveren.</p>
      <details><summary>CSV-skabelon</summary><p>Eksempel: Ret navn, placering og webadresse før import.</p><pre className="overflow-x-auto text-xs" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{template}</pre><button type="button" className={actionClass} disabled={!brand} onClick={() => changeCsv(template)}>Brug skabelon</button></details>
      <button type="button" className={actionClass} disabled={!brand || !csv.trim()} onClick={() => { void inspect(); }}>Kontrollér CSV</button>
    </fieldset>
    {preview && <div className="space-y-3">
      {preview.errors.length > 0 && <div role="alert"><h3 className="font-semibold">Ret fejlene før import</h3><ul>{preview.errors.map((failure, index) => <li key={index}>{Number.isInteger(failure.row) && failure.row !== null && failure.row >= 1 && failure.row <= MAX_ROWS + 1 ? `Række ${failure.row}: ` : ''}{FIELD_NAMES[failure.field] || 'CSV'}: {ERROR_NAMES[failure.code] || 'Data kunne ikke valideres.'}</li>)}</ul></div>}
      <div style={{ overflowX: 'auto' }}><table className="w-full text-sm" aria-label="CSV-preview"><thead><tr><th scope="col">Række</th><th scope="col">Navn</th><th scope="col">Webadresse</th><th scope="col">Brand</th><th scope="col">Placering</th><th scope="col">Kampagne</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}><th scope="row">{row.row}</th><td>{row.entry?.name || 'Fejl'}</td><td style={{ overflowWrap: 'anywhere' }}>{row.entry?.destination || '—'}</td><td>{row.entry?.brandId || '—'}</td><td>{row.entry?.locationId || (row.entry ? 'Hele brandet' : '—')}</td><td>{row.entry?.campaign || '—'}</td></tr>)}</tbody></table></div>
      {preview.ok && preview.plan && <div className="space-y-3"><label className="flex items-start gap-2"><input type="checkbox" disabled={locked} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Jeg vil oprette {count} dynamiske QR-koder for {brand?.name}.</label><button type="button" className={actionClass} disabled={locked || !confirmed} onClick={commit}>Opret {count} QR-koder</button></div>}
    </div>}
  </section>;
}
