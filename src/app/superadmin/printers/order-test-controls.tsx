'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CredentialScope } from './printer-credentials-client';

type Scope = CredentialScope & { credentialRevision: number };
type Status = { state: 'not_started' | 'active' | 'stopped' | 'expired' | 'stale'; expiresAt: number | null; enabled: boolean };
export function PrinterOrderTestControls({ scope, permitted, active }: { scope: Scope; permitted: boolean; active: boolean }) {
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const generation = useRef(0), pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  const scopeKey = JSON.stringify(scope);
  useEffect(() => { generation.current++; pending.current = false; setBusy(false); setMessage(''); setStatus(null);
    return () => { generation.current++; request.current?.abort(); }; }, [scopeKey, permitted, active]);
  async function perform(operation: 'read' | 'start' | 'stop') {
    if (pending.current || !permitted) return;
    if (operation === 'start' && (!active || status?.state !== 'not_started' || !status.enabled)) return;
    if (operation === 'stop' && status?.state !== 'active') return;
    const version = generation.current; pending.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(); request.current = controller;
    try {
      const query = new URLSearchParams(Object.entries(scope).map(([k, v]) => [k, String(v)]));
      const response = await fetch(`/api/superadmin/printers/order-test${operation === 'read' ? `?${query}` : ''}`, {
        method: operation === 'read' ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
        signal: controller.signal,
        ...(operation !== 'read' ? { headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...scope, operation: operation === 'start' ? 'startIndependent' : operation }) } : {}),
      });
      if (generation.current !== version) return;
      if (!response.ok) throw Error(String(response.status));
      const reader = response.body?.getReader(); if (!reader) throw Error('invalid');
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 4096) { await reader.cancel(); throw Error('invalid'); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (generation.current !== version) return;
      if (!result || Object.entries(scope).some(([k, v]) => result[k] !== v)
        || !['not_started', 'active', 'stopped', 'expired', 'stale'].includes(result.state)
        || result.unattendedAuthorized !== false || typeof result.enabled !== 'boolean'
        || !(result.expiresAt === null || Number.isSafeInteger(result.expiresAt))) throw Error('invalid');
      setStatus(result);
    } catch (e) {
      if (generation.current === version) {
        setStatus(null);
        setMessage(e instanceof Error && e.message === '503' ? 'Ordretesten er ikke tilgængelig. Kontrollér serveropsætningen.'
          : e instanceof Error && e.message === '409' ? 'Kan ikke starte: kontrollér printeradgang, gemte køkkenregler. Et testvindue kan kun startes én gang.'
          : 'Resultatet er ukendt. Hent status før du fortsætter.');
      }
    } finally { if (generation.current === version) { pending.current = false; setBusy(false); } }
  }
  return <section className="space-y-3 rounded border p-3" aria-label="Test køb med automatisk print">
    <h4 className="font-medium">Test køb med automatisk køkkenprint</h4>
    <p className="text-sm">Aktivér automatisk køkkenprint i 60 minutter. Testbon er valgfri og kræves ikke. Gem først én køkkenregel: alle produkter til denne printer. Brug enkelte produkter i første testkøb. Menuer og kombinationer kan købes, men udskrives ikke i denne test.</p>
    <Button type="button" variant="outline" disabled={busy || !permitted} onClick={() => void perform('read')}>Hent ordreteststatus</Button>
    {status && <p role="status">{({ not_started: 'Ikke startet', active: 'Ordretest aktiv', stopped: 'Ordretest stoppet', expired: 'Ordretest udløbet', stale: 'Printeropsætningen er ændret' })[status.state]}
      {status.expiresAt && ` · Slutter ${new Date(status.expiresAt).toLocaleTimeString('da-DK')}`}</p>}
    {status?.state === 'not_started' && <>
      <Button type="button" disabled={busy || !active || !permitted || !status.enabled}
        onClick={() => void perform('start')}>Start 60 minutters ordretest</Button>
      {!status.enabled && <p className="text-sm">Ordretest skal aktiveres i serveropsætningen før start.</p>}
    </>}
    {status?.state === 'active' && <Button type="button" variant="destructive" disabled={busy || !permitted} onClick={() => void perform('stop')}>Stop ordretest</Button>}
    <p className="text-sm">Printeren skal bruge ordre-adressen under Printeradgang til køb. Hvis et print mangler eller status er ukendt, kontrollér papiret før genprint.</p>
    {message && <p role="alert">{message}</p>}
  </section>;
}
