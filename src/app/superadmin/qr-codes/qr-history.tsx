'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { QrHistoryResult } from '@/lib/qr/history';

export type QrHistoryProps = { codes: Array<{ id: string; name: string }>; load: (id: string) => Promise<QrHistoryResult> };
const actions: Record<string, string> = { create: 'Oprettet', duplicate: 'Kopieret', bulk_create: 'Oprettet via import', update: 'Redigeret', paused: 'Sat på pause', active: 'Aktiveret', archived: 'Arkiveret' };
const labels: Record<string, string> = { name: 'Navn', destination: 'Destination', locationId: 'Placering', campaign: 'Kampagne', tags: 'Tags', expiresAt: 'Udløb', status: 'Status', design: 'Udseende' };
const date = (at: number) => new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }).format(new Date(at));

export function QrHistory({ codes, load }: QrHistoryProps) {
  const [selected, setSelected] = useState(''), [result, setResult] = useState<QrHistoryResult | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), loadRef = useRef(load); loadRef.current = load;
  const choices = JSON.stringify(codes.map(code => code.id));
  useEffect(() => {
    generation.current++; setResult(null); setBusy(false); setError('');
    if (selected && !codes.some(code => code.id === selected)) setSelected('');
    return () => { generation.current++; };
  }, [choices]);
  const request = async (id: string) => {
    const at = ++generation.current; setSelected(id); setResult(null); setError('');
    if (!id) { setBusy(false); return; }
    setBusy(true);
    try { const value = await loadRef.current(id); if (at === generation.current) setResult(value); }
    catch { if (at === generation.current) setError('Historikken kunne ikke hentes. Kontrollér din adgang og prøv igen.'); }
    finally { if (at === generation.current) setBusy(false); }
  };
  return <section aria-label="QR-ændringshistorik" aria-busy={busy} className="space-y-3 rounded-lg border p-4" style={{ minWidth: 0 }}>
    <h2 className="text-lg font-semibold">Ændringshistorik</h2>
    <p className="text-sm">Vælg en gemt kode. Gamle poster uden detaljesnapshot vises med ukendte detaljer.</p>
    <label className="block">QR-kode til historik<select aria-label="QR-kode til historik" className="block w-full rounded-md border bg-background px-3 py-2 text-sm" style={{ maxWidth: '100%' }} value={selected} onChange={event => { void request(event.target.value); }}><option value="">Vælg QR-kode</option>{codes.map(code => <option key={code.id} value={code.id}>{code.name}</option>)}</select></label>
    {selected && <button type="button" className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => { void request(selected); }}>Genindlæs historik</button>}
    {busy && <p role="status">Henter historik…</p>}{error && <p role="alert">{error}</p>}
    {!codes.length && <p>Der er ingen tilgængelige gemte QR-koder.</p>}
    {result && <>
      {result.truncated && <p role="status">Viser de seneste 50 poster. Der findes ældre historik.</p>}
      {result.discarded > 0 && <p role="status">{result.discarded} poster kunne ikke vises inden for din adgang eller datagrundlaget. Historikken er ikke komplet.</p>}
      {!result.rows.length && <p>Ingen ændringer fundet for denne kode.</p>}
      <ol aria-label="Historikposter" className="space-y-3" style={{ listStyle: 'none', padding: 0 }}>{result.rows.map(row => <li key={row.id} className="rounded-md border p-3" style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
        <h3 className="font-semibold">{actions[row.action] || 'Anden ændring'} · revision {row.revision}</h3>
        <p className="text-sm"><time dateTime={new Date(row.at).toISOString()}>{date(row.at)}</time> · Medarbejder-ID: {row.actorId}</p>
        <p className="text-sm">Forrige revision: {row.previousRevision ?? 'Ingen'}</p>
        {row.changes === undefined ? <p className="text-sm">Detaljer er ukendte eller ligger uden for din adgang.</p> : !row.changes.length ? <p className="text-sm">Ingen ændringer i de viste detaljefelter.</p> : <dl className="space-y-2">{row.changes.map(change => <div key={change.field}>
          <dt className="font-medium">{labels[change.field] || change.field}</dt><dd className="text-sm" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>Før: {change.before ?? 'Ikke angivet'}<br />Efter: {change.after ?? 'Ikke angivet'}</dd>
        </div>)}</dl>}
      </li>)}</ol>
    </>}
  </section>;
}
