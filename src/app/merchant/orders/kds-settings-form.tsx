'use client';
import { useEffect, useRef, useState } from 'react';
import type { KdsSettings } from '@/lib/orders/kds-settings';
export function KdsSettingsForm({ settings, revision, brandId, locationId, endpoint, canEdit, onSaved }: {
  settings: KdsSettings; revision: number; brandId?: string; locationId?: string; endpoint: string; canEdit: boolean; onSaved: () => void;
}) {
  const [draft, setDraft] = useState(settings), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const pending = useRef<object | null>(null), lock = useRef(false);
  useEffect(() => { pending.current = null; setMessage(''); }, [brandId, locationId]);
  useEffect(() => { if (!pending.current) setDraft(settings); }, [revision, brandId, locationId, settings]);
  async function save() {
    if (lock.current || !canEdit || !brandId || !locationId) return;
    pending.current ??= { brandId, locationId, settings: draft, expectedRevision: revision, requestId: crypto.randomUUID() };
    lock.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.success) { if (response.status < 500) pending.current = null; throw Error(result.message || 'Indstillingerne kunne ikke gemmes.'); }
      pending.current = null; setMessage('Indstillingerne er gemt.'); onSaved();
    } catch (error) { setMessage(error instanceof Error && error.name !== 'AbortError' ? error.message : 'Gemning er ikke bekræftet. Prøv igen.'); }
    finally { clearTimeout(timeout); lock.current = false; setBusy(false); }
  }
  return <div className="space-y-4">
    {([{key:'preorderMinutes',label:'Start forudbestilling og print før klartid (minutter)',max:1440},{key:'warningMinutes',label:'Gul advarsel før klartid (minutter)',max:120},{key:'overdueMinutes',label:'Rød advarsel og lyd efter klartid (minutter)',max:120}] as const).map(field => <label key={field.key} className="flex flex-wrap items-center gap-3">{field.label}<input aria-label={field.label} type="number" min="0" max={field.max} value={draft[field.key]} disabled={!canEdit || busy || !!pending.current} className="min-h-12 w-24 rounded-lg border p-3" onChange={event => setDraft(current => ({...current,[field.key]:Math.max(0,Math.min(field.max,Math.round(Number(event.target.value))))}))} /></label>)}
    <label className="flex items-center gap-3"><input type="checkbox" checked={draft.sleepWhenClosed} disabled={!canEdit || busy || !!pending.current} onChange={event => setDraft(current=>({...current,sleepWhenClosed:event.target.checked}))} />Nattilstand efter restaurantens lukketid</label>
    <p className="text-sm">Fælles for restaurantens KDS og automatiske print. Igangværende ordrer holder KDS vågen. Forsinkelsesalarmen gentages hvert minut.</p>
    <button className="min-h-12 rounded-lg bg-slate-900 px-4 font-semibold text-white disabled:opacity-50" disabled={!canEdit || busy || !brandId || !locationId} onClick={() => void save()}>{busy ? 'Gemmer…' : 'Gem ordreindstillinger'}</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
