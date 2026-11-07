'use client';
import { useRef, useState } from 'react';
import type { TerminalOrder } from '@/lib/orders/terminal-types';
import { kitchenCountdown, kitchenDeadline } from '@/lib/orders/kitchen-clock';
export function KitchenClock({ order, now, canEdit, disabled, endpoint, onChanged, alertClass }: {
  alertClass?: string; order: TerminalOrder; now: number; canEdit: boolean; disabled: boolean; endpoint: string; onChanged: () => void;
}) {
  const deadline = kitchenDeadline(order), late = !!deadline && now > Date.parse(deadline);
  const active = ['Received', 'In Progress'].includes(order.status);
  const [editing, setEditing] = useState(false), [minutes, setMinutes] = useState(30), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef<{ orderId: string; brandId: string; locationId: string; expectedReadyAt: string | null; readyAt: string; requestId: string } | null>(null);
  const lock = useRef(false);
  const time = deadline ? new Date(deadline).toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' }) : 'Ikke angivet';
  async function save() {
    if (lock.current || disabled || !canEdit || !active || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;
    lock.current = true; setBusy(true); setError('');
    pending.current ??= { orderId: order.id, brandId: order.brandId, locationId: order.locationId, expectedReadyAt: order.kitchenReadyAt ?? null, readyAt: new Date(now + minutes * 60_000).toISOString(), requestId: crypto.randomUUID() };
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.success) {
        if (response.status < 500) pending.current = null;
        setError(result.message || 'Tiden kunne ikke gemmes. Opdater og prøv igen.'); onChanged(); return;
      }
      pending.current = null; setEditing(false); onChanged();
    } catch { setError('Tiden er ikke bekræftet. Prøv samme ændring igen eller opdater.'); }
    finally { clearTimeout(timer); lock.current = false; setBusy(false); }
  }
  return <div className="my-3 space-y-2">
    <button aria-label={`Ændr klartid for ${order.id}`} disabled={!canEdit || disabled || !active || busy} onClick={() => { setMinutes(Math.max(1, Math.ceil(((deadline ? Date.parse(deadline) : now + 30 * 60_000) - now) / 60_000))); setEditing(value => !value); }} className={`min-h-16 w-full rounded-xl border-2 p-3 text-left ${alertClass || (late && active ? 'border-red-600 bg-red-50 text-red-900' : 'border-slate-200 bg-slate-50')}`}>
      <span className="block font-semibold">Klar kl. {time}</span>
      <strong className="block text-3xl tabular-nums">{active ? kitchenCountdown(deadline, now) : order.status === 'Ready' ? 'Klar ✓' : ['Completed', 'Delivered'].includes(order.status) ? 'Afsluttet' : 'Ikke aktiv'}</strong>
      {canEdit && active && <span className="text-sm">Tryk for at ændre køkkentiden</span>}
    </button>
    {editing && <div className="space-y-3 rounded-xl border bg-slate-50 p-3">
      <label className="block font-semibold">Klar om (minutter)<input aria-label={`Klar om minutter for ${order.id}`} type="number" min="1" max="1440" value={minutes} disabled={busy || !!pending.current} onChange={event => setMinutes(Number(event.target.value))} className="mt-1 min-h-14 w-full rounded-lg border p-3 text-xl" /></label>
      <div className="flex flex-wrap gap-2">{[5, 10, 15].map(value => <button key={value} className="min-h-14 rounded-lg border bg-white px-4 text-lg font-semibold" disabled={busy || !!pending.current} onClick={() => setMinutes(current => Math.min(1440, current + value))}>+{value} min</button>)}</div>
      <p className="text-sm">Ændrer køkkenets klartid. Kundens aftale og kurérbooking ændres ikke.</p>
      <button className="min-h-14 w-full rounded-xl bg-blue-700 p-3 text-lg font-semibold text-white disabled:opacity-50" disabled={busy || disabled || minutes < 1 || minutes > 1440} onClick={() => void save()}>{busy ? 'Gemmer…' : 'Gem klartid'}</button>
      <button className="min-h-12 w-full rounded-lg border p-3" disabled={busy} onClick={() => { setEditing(false); pending.current = null; }}>Luk tidsindstilling</button>
    </div>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{error}</p>}
  </div>;
}
