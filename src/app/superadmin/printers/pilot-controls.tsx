'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CredentialScope } from './printer-credentials-client';
import { PrinterOrderTestControls } from './order-test-controls';

type Scope = CredentialScope & { credentialRevision: number };

const statusLabels = {
  none: 'Ingen testbon er klargjort.', queued: 'Testbonen venter på printeren.',
  offered: 'Testbonen er tilbudt printeren.', download_started: 'Overførsel af testbonen er startet. Afventer printerens svar.',
  confirmed: 'Printeren har meldt testbonen udskrevet. Kontrollér papiret ved printeren.',
  failed: 'Printeren har meldt fejl. Kontrollér printeren, før der foretages mere.',
  unknown: 'Udskriftens resultat er usikkert. Kontrollér papiret. Send ikke bonen igen.',
  expired: 'Testforløbet er udløbet. En eventuel udskrift er ikke bekræftet. Kontrollér printeren.',
};
type PilotState = keyof typeof statusLabels;
const sameScope = (r: Record<string, unknown>, s: Scope) => Object.keys(s).every(key => r[key] === s[key as keyof Scope]);
async function responseBody(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('invalid_response');
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 8192) { await reader.cancel().catch(() => {}); throw Error('invalid_response'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>;
}

/** One explicit fixed test print; status polling never queues or retries a print. */
export function PrinterPilotControls({ scope, model, paperWidthMm, active, permitted, onSessionLost }: {
  scope: Scope; model: 'mc-print2' | 'mc-print3'; paperWidthMm: 58 | 80; active: boolean; permitted: boolean; onSessionLost: () => void;
}) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [pilotState, setPilotState] = useState<PilotState | null>(null), [statusMessage, setStatusMessage] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const unresolvedRequest = useRef<string | null>(null);
  const pending = useRef(false), lifetime = useRef(0), request = useRef<AbortController | null>(null);
  const lost = useRef(onSessionLost); lost.current = onSessionLost;
  useEffect(() => {
    const generation = ++lifetime.current;
    setBusy(false); setPilotState(null); setStatusMessage(''); setMessage(''); setUncertain(false);
    pending.current = false; unresolvedRequest.current = null;
    void refreshStatus();
    const timer = setInterval(() => { void refreshStatus(); }, 5000);
    return () => { clearInterval(timer); if (lifetime.current === generation) lifetime.current++; request.current?.abort(); pending.current = false; };
  // Scope values define the lifetime of both requests and the polling timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.brandId, scope.locationId, scope.printerId, scope.printerRevision, scope.credentialRevision, permitted, active]);
  async function refreshStatus() {
    if (!permitted || pending.current) return;
    const generation = lifetime.current, controller = new AbortController(); request.current = controller;
    pending.current = true;
    const current = () => lifetime.current === generation && !controller.signal.aborted;
    try {
      const query = new URLSearchParams(Object.entries(scope).map(([key, value]) => [key, String(value)]));
      const response = await fetch(`/api/superadmin/printers/pilot?${query}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!current()) return;
      if (response.status === 401) { setStatusMessage('Din session er udløbet. Log ind igen.'); lost.current(); return; }
      if (response.status !== 200) {
        setStatusMessage(response.status === 409 ? 'Printeropsætningen eller den gemte test er ændret. Opdater printeroversigten.'
          : 'Status kunne ikke hentes. Kontrollér printeren, før du forsøger igen.'); return;
      }
      const result = await responseBody(response);
      if (!current()) return;
      const expected = [...Object.keys(scope), 'state', 'createdAt', 'expiresAt', 'confirmedAt', 'physicalCompatibilityVerified'].sort().join(',');
      if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).sort().join(',') !== expected
        || !sameScope(result, scope) || typeof result.state !== 'string' || !Object.hasOwn(statusLabels, result.state)
        || result.physicalCompatibilityVerified !== false
        || ['createdAt', 'expiresAt', 'confirmedAt'].some(key => result[key] !== null && (typeof result[key] !== 'number'
          || !Number.isSafeInteger(result[key]) || (result[key] as number) <= 0))) throw Error('invalid_response');
      const state = result.state as PilotState;
      setPilotState(state); setStatusMessage(statusLabels[state]);

    } catch { if (current()) setStatusMessage('Status kunne ikke bekræftes. Kontrollér printeren, før du forsøger igen.'); }
    finally { if (current()) { pending.current = false; request.current = null; } }
  }
  async function print(retry = false) {
    if (!permitted || !active || pending.current
      || (retry ? !unresolvedRequest.current : uncertain || !['none', 'confirmed', 'expired'].includes(pilotState || ''))) return;
    const generation = lifetime.current, controller = new AbortController(); request.current = controller;
    pending.current = true; setBusy(true); setMessage('Sender testbon…'); setUncertain(true);
    const current = () => lifetime.current === generation && !controller.signal.aborted;
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const requestId = unresolvedRequest.current ?? btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      unresolvedRequest.current = requestId;
      const response = await fetch('/api/superadmin/printers/pilot', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'print', ...scope, requestId }), signal: controller.signal });
      if (!current()) return;
      if (response.status === 401) { setMessage('Din session er udløbet. Log ind igen.'); lost.current(); return; }
      if (response.status !== 201) {
        if ([400, 403, 409].includes(response.status)) { setUncertain(false); unresolvedRequest.current = null; }
        setMessage(response.status === 503 ? 'Testprint er ikke tilgængeligt. Hent status før et nyt forsøg.'
          : response.status === 409 ? 'Printeren skal være forbundet via Test URL. Opdater forbindelsen og prøv igen.'
            : response.status === 403 ? 'Du har ikke adgang til denne handling.' : 'Testbonnen kunne ikke sendes. Hent status før et nyt forsøg.'); return;
      }
      const result = await responseBody(response);
      if (!current()) return;
      const expected = [...Object.keys(scope), 'jobId', 'physicalCompatibilityVerified'].sort().join(',');
      if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).sort().join(',') !== expected
        || !sameScope(result, scope) || result.physicalCompatibilityVerified !== false
        || typeof result.jobId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.jobId)) throw Error('invalid_response');
      setUncertain(false); unresolvedRequest.current = null;
      setPilotState('queued'); setMessage('Testbonnen er klargjort. Afventer printeren.');
    } catch { if (current()) setMessage('Svaret er ukendt. Status kontrolleres automatisk; der sendes ikke en ekstra bon.'); }
    finally { if (current()) { pending.current = false; setBusy(false); request.current = null; void refreshStatus(); } }
  }
  return <section aria-label="Testprint" className="border-t pt-4 space-y-3">
    <h3 className="font-semibold">Testprint</h3>
    <p className="text-sm">Udskriv en dummy-køkkenbon på {model === 'mc-print2' ? 'Star mC-Print2' : 'Star mC-Print3'} · {paperWidthMm} mm. Printeren skal have papir og bruge Test URL.</p>
    {!active && <p role="status">Printeren er deaktiveret.</p>}
    <Button disabled={!permitted || !active || busy || uncertain || !['none', 'confirmed', 'expired'].includes(pilotState || '')} onClick={() => void print()}>Print testbon</Button>
    {uncertain && <Button variant="outline" disabled={!permitted || !active || busy} onClick={() => void print(true)}>Prøv samme testbon igen</Button>}
    <Button variant="outline" disabled={!permitted || busy} onClick={() => void refreshStatus()}>Opdater testbonens status</Button>
    {message && <p role="status">{message}</p>}
    {statusMessage && <p role="status">{statusMessage}</p>}
    {pilotState === 'confirmed' && <PrinterOrderTestControls scope={scope} permitted={permitted} active={active} />}
  </section>;
}
