'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PrinterPilotAddress } from './printer-pilot-address';
import type { PrinterConfiguration } from '@/lib/printing/domain';
type Item = { configuration: PrinterConfiguration; revision: number };
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
async function readBody(response: Response): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader(); if (!reader) throw Error('invalid_response');
  let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 8192) { void reader.cancel().catch(() => {}); throw Error('invalid_response'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
  const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('invalid_response');
  return data as Record<string, unknown>;
}
/** Orchestrates existing audited review/resume; a GET never authorizes activation. */
export function PrinterActivationPanel({ item, permitted, onPendingChange, onCancel, onSessionLost, onSaved }: {
  item: Item; permitted: boolean; onPendingChange: (pending: boolean) => void;
  onCancel: () => void; onSessionLost: () => void; onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [review, setReview] = useState<number | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [complete, setComplete] = useState(false);
  const request = useRef<AbortController | null>(null), mounted = useRef(true);
  const allowed = useRef(permitted); allowed.current = permitted;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const c = item.configuration, scope = { brandId: c.brandId, locationId: c.locationId, printerId: c.id };
  const matches = (data: Record<string, unknown>) => Object.keys(scope).every(k => data[k] === scope[k as keyof typeof scope]);
  async function run(activate: boolean) {
    if (!permitted || request.current || refreshRequired || complete || c.state === 'active' || activate && review === null) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); onPendingChange(true); setMessage('Afventer bekræftelse…');
    const current = () => mounted.current && !controller.signal.aborted && allowed.current;
    const options = { credentials: 'same-origin' as const, cache: 'no-store' as const, signal: controller.signal };
    const check = async (response: Response) => {
      if (response.status === 401) { onSessionLost(); throw Error('session_lost'); }
      if (response.status !== 200) throw Error('request_denied');
      return readBody(response);
    };
    try {
      if (!activate) {
        const data = await check(await fetch('/api/merchant/printers/queue?' + new URLSearchParams(scope), options));
        if (!current()) return;
        const summary = data.summary as Record<string, unknown> | null;
        if (!matches(data) || data.printerRevision !== item.revision || data.printerState !== c.state
          || data.resumeAuthorized !== false || data.status !== 'verified' || data.reason !== null || !positive(data.queueRevision)
          || !summary || summary.pendingCount !== 0 || ['oldestCreatedAt', 'newestCreatedAt', 'oldestAgeMs', 'newestAgeMs'].some(k => summary[k] !== null)) throw Error('queue_not_verified_empty');
        setReview(data.queueRevision); setMessage('Printkøen er verificeret tom. Bekræft aktivering af denne printer.'); return;
      }
      const queueRevision = review!; setReview(null);
      const send = (url: string, body: unknown) => fetch(url, { ...options, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const receipt = await check(await send('/api/merchant/printers/queue/review', { ...scope,
        printerRevision: item.revision, queueRevision, decision: 'resume_empty' }));
      if (!current()) return;
      if (!matches(receipt) || receipt.printerRevision !== item.revision || receipt.queueRevision !== queueRevision
        || receipt.decision !== 'resume_empty' || receipt.resumeAuthorized !== false || !positive(receipt.expiresAt)
        || receipt.expiresAt <= Date.now() || receipt.expiresAt > Date.now() + 600000
        || typeof receipt.receipt !== 'string' || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(receipt.receipt)) throw Error('invalid_receipt');
      const result = await check(await send('/api/merchant/printers/lifecycle', { ...scope,
        revision: item.revision, action: 'resume', receipt: receipt.receipt, queueRevision }));
      if (!current()) return;
      const saved = result.item as { configuration?: Record<string, unknown>; revision?: unknown } | undefined;
      if (!saved || saved.revision !== item.revision + 1 || !saved.configuration
        || Object.keys(saved.configuration).sort().join(',') !== Object.keys(c).sort().join(',')
        || Object.entries({ ...c, state: 'active' }).some(([k, v]) => saved.configuration![k] !== v)) throw Error('invalid_result');
      setComplete(true); onSaved();
    } catch {
      if (current()) { setReview(null); setRefreshRequired(true); setMessage('Handlingen kunne ikke bekræftes. Opdater oversigten og kontrollér printerens status før et nyt forsøg.'); }
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current) { setBusy(false); onPendingChange(false); }
    }
  }
  return <section role="dialog" aria-label="Aktivér printer" className="rounded-lg border bg-card p-4 space-y-3">
    <h2 className="font-semibold">Aktivér printer: {c.name}</h2>
    <p className="text-sm">Aktivér kun i et aftalt testvindue. Først kontrolleres den eksisterende printkø. En ukendt eller ikke-tom kø kan ikke frigives her.</p>
    <p className="text-sm">Efter aktivering ændres printerens revision. Opdater printeradgangen, erstat adgangskoden, og start et nyt testforløb. Aktivering sender ikke en testbon.</p>
    {c.transport === 'cloudprnt-http' && <PrinterPilotAddress scope={scope} />}
    {message && <p role="status">{message}</p>}
    <div className="flex flex-wrap gap-3">
      {review === null ? <Button disabled={!permitted || busy || refreshRequired || complete} onClick={() => void run(false)}>Kontrollér printkø</Button>
        : <Button disabled={!permitted || busy || refreshRequired || complete} onClick={() => void run(true)}>Bekræft aktivering</Button>}
      <Button variant="outline" disabled={busy} onClick={onCancel}>{refreshRequired ? 'Opdater oversigten' : 'Annuller'}</Button>
    </div>
  </section>;
}
