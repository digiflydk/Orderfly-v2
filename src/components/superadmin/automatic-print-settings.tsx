'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type Snapshot = { brandId: string; enabled: boolean; revision: number; enabledAt: number | null };
const endpoint = '/api/superadmin/printers/automatic-print';
function snapshot(value: unknown, brandId: string): Snapshot {
  const data = value as Snapshot;
  if (!data || data.brandId !== brandId || typeof data.enabled !== 'boolean' || !Number.isSafeInteger(data.revision) || data.revision < 0
    || !(data.enabledAt === null || Number.isSafeInteger(data.enabledAt) && data.enabledAt >= 0 && data.enabledAt <= 8.64e15)
    || (data.enabled && data.enabledAt === null)) throw Error('invalid_response');
  return data;
}

export function AutomaticPrintSettings({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [saved, setSaved] = useState<Snapshot | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0), submitting = useRef(false);
  const current = saved?.brandId === brandId ? saved : null;
  const dirty = !!current && (current.revision === 0 || current.enabled !== enabled);
  useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    setSaved(null); setError(''); setNotice(''); setBlocked(false); setSaving(false); submitting.current = false;
    void (async () => {
      try {
        const response = await fetch(`${endpoint}?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'access' : 'unavailable');
        const result = snapshot(await response.json(), brandId);
        if (generation.current !== version) return;
        setSaved(result); setEnabled(result.enabled);
      } catch (cause) {
        if (generation.current === version && !controller.signal.aborted) setError(cause instanceof Error && cause.message === 'access'
          ? 'Du har ikke adgang. Log ind igen som superadmin.' : 'Indstillingen kunne ikke indlæses. Prøv igen.');
      }
    })();
    return () => { ++generation.current; controller.abort(); };
  }, [brandId, reload]);
  async function save() {
    if (!current || !dirty || blocked || submitting.current) return;
    const version = generation.current, expected = enabled;
    submitting.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, enabled: expected, expectedRevision: current.revision }) });
      if (generation.current !== version) return;
      if (response.status === 409) throw Error('conflict');
      if (response.status === 401 || response.status === 403) throw Error('access');
      if (!response.ok) throw Error('unavailable');
      const result = snapshot(await response.json(), brandId);
      if (result.enabled !== expected || result.revision < current.revision) throw Error('invalid_response');
      if (generation.current !== version) return;
      setSaved(result); setEnabled(result.enabled); setNotice('Indstillingen er gemt.');
    } catch (cause) {
      if (generation.current !== version) return;
      setBlocked(true);
      const code = cause instanceof Error ? cause.message : '';
      setError(code === 'conflict' ? 'Indstillingen er ændret af en anden. Genindlæs, før du gemmer igen.'
        : code === 'access' ? 'Adgangen er ændret. Log ind igen som superadmin, og genindlæs indstillingen.'
          : 'Gemningen kunne ikke bekræftes. Genindlæs for at se den gemte indstilling, før du prøver igen.');
    } finally {
      if (generation.current === version) { submitting.current = false; setSaving(false); }
    }
  }
  return <section className="space-y-4 rounded-lg border p-4 md:p-6" aria-label="Automatisk print">
    <div><h2 className="text-lg font-semibold">Automatisk print</h2><p className="mt-1 text-sm text-muted-foreground">Print køkkenbonner automatisk for {brandName}, uden tidsbegrænsning.</p></div>
    {!current && !error && <p role="status">Indlæser indstilling…</p>}
    {current && <>
      <p className="text-sm">Gemt status: <strong>{current.revision === 0 ? 'Ikke indstillet' : current.enabled ? 'Aktiveret' : 'Deaktiveret'}</strong></p>
      {current.revision === 0 && <p className="text-sm text-muted-foreground">Gem Deaktiveret for også at stoppe en tidligere ordretest.</p>}
      <label className="flex items-center gap-3 text-sm font-medium">
        <input type="checkbox" role="switch" aria-label="Automatisk print" checked={enabled} disabled={saving || blocked}
          onChange={event => { setEnabled(event.target.checked); setNotice(''); }} />Automatisk print
      </label>
      <p className="text-sm text-muted-foreground">Gælder nye ordrer på brandets lokationer med en aktiv printer og opsat printerrute. Eksisterende ordrer genprintes ikke.</p>
      <p className="text-sm text-muted-foreground">Automatisk print understøtter almindelige produkter. Ordrer med menuer eller kombinationer skal fortsat genprintes manuelt fra salgsordren.</p>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={!dirty || saving || blocked} onClick={() => void save()}>{saving ? 'Gemmer…' : 'Gem automatisk print'}</Button>
      <Button type="button" variant="outline" disabled={saving} onClick={() => { ++generation.current; setSaved(null); setReload(value => value + 1); }}>Genindlæs</Button>
      {dirty && <span className="text-sm text-muted-foreground">Ikke-gemte ændringer</span>}
    </div>
  </section>;
}
