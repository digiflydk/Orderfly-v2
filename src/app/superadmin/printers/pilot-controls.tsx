'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { CredentialScope } from './printer-credentials-client';

type Scope = CredentialScope & { credentialRevision: number };
type Session = Scope & { sessionId: string; nonce: string; expiresAt: number };
const flags = ['outputAuthorized', 'dispatchAuthorized', 'activationAuthorized', 'physicalCompatibilityVerified'];
const token = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
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

/** One supervised ceremony per mounted same-revision row. Nonce is memory-only. */
export function PrinterPilotControls({ scope, model, paperWidthMm, active, permitted, onSessionLost }: {
  scope: Scope; model: 'mc-print2' | 'mc-print3'; paperWidthMm: 58 | 80; active: boolean; permitted: boolean; onSessionLost: () => void;
}) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [started, setStarted] = useState(false);
  const [operator, setOperator] = useState(''), [sku, setSku] = useState(''), [firmware, setFirmware] = useState('');
  const [capture, setCapture] = useState<string | null>(null), [captureBusy, setCaptureBusy] = useState(false);
  const [identified, setIdentified] = useState(false), [correlated, setCorrelated] = useState(false), [complete, setComplete] = useState(false);
  const session = useRef<Session | null>(null), pending = useRef(false), lifetime = useRef(0), request = useRef<AbortController | null>(null);
  const captureGeneration = useRef(0), lost = useRef(onSessionLost); lost.current = onSessionLost;
  useEffect(() => {
    const generation = ++lifetime.current;
    return () => { if (lifetime.current === generation) lifetime.current++; request.current?.abort(); session.current = null; pending.current = false; captureGeneration.current++; };
  }, [scope.brandId, scope.locationId, scope.printerId, scope.printerRevision, scope.credentialRevision, permitted, active]);
  async function selectCapture(file: File | undefined) {
    const generation = ++captureGeneration.current; setCapture(null);
    if (!file || file.size < 1 || file.size > 10 * 1024 * 1024) { setCaptureBusy(false); setMessage('Vælg en lokal dokumentation på højst 10 MB.'); return; }
    setCaptureBusy(true);
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      if (captureGeneration.current === generation) { setCapture(Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')); setMessage('Dokumentation valgt. Filen bliver på din enhed.'); }
    } catch { if (captureGeneration.current === generation) setMessage('Dokumentationen kunne ikke læses. Vælg filen igen.'); }
    finally { if (captureGeneration.current === generation) setCaptureBusy(false); }
  }
  async function submit(operation: 'issue' | 'attest') {
    if (!permitted || !active || pending.current || complete) return;
    const previous = session.current;
    if (operation === 'attest' && (!previous || previous.expiresAt <= Date.now() || !identified || !correlated || !capture
      || !/^[A-Za-z0-9_-]{1,128}$/.test(operator) || !/^[A-Za-z0-9 _.-]{1,64}$/.test(sku)
      || !/^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(firmware))) { setMessage('Udfyld dokumentationen og bekræft observationerne. Er forløbet udløbet, skal du starte et nyt.'); return; }
    const generation = lifetime.current, controller = new AbortController(); request.current = controller;
    pending.current = true; setBusy(true); setMessage('Afventer bekræftelse…'); session.current = null; setStarted(false);
    const current = () => lifetime.current === generation && !controller.signal.aborted;
    const command = operation === 'issue' ? { operation, ...scope } : { operation, attestation: {
      ...scope, sessionId: previous!.sessionId, nonce: previous!.nonce, trust: 'supervised_operator', operatorId: operator,
      physicalDeviceIdentified: true, nativeEnrollmentCorrelated: true, method: 'stario_firmware_query', model,
      labelSku: sku, firmware, captureDigest: capture, paperWidthMm, rasterWidthDots: paperWidthMm === 58 ? 384 : 576,
      transport: 'cloudprnt-http', mediaType: 'image/png',
    } };
    try {
      const response = await fetch('/api/superadmin/printers/pilot', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command), signal: controller.signal });
      if (!current()) return;
      if (response.status === 401) { setMessage('Din session er udløbet. Log ind igen.'); lost.current(); return; }
      if (response.status !== 201) {
        setMessage(response.status === 503 ? 'Testforløbet er ikke tilgængeligt. Ingen udskrift er bekræftet.'
          : response.status === 409 ? 'Printeren eller testforløbet er ændret. Opdater printeroversigten før et nyt forsøg.'
            : response.status === 403 ? 'Du har ikke adgang til denne handling.' : 'Testforløbet kunne ikke bekræftes. Kontrollér oplysningerne før et nyt forsøg.'); return;
      }
      const result = await responseBody(response);
      if (!current()) return;
      const expected = [...Object.keys(scope), ...flags, 'sessionId', ...(operation === 'issue' ? ['nonce', 'expiresAt'] : ['jobId', 'contentDigest', 'trust'])].sort().join(',');
      if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).sort().join(',') !== expected
        || !sameScope(result, scope) || flags.some(key => result[key] !== false) || typeof result.sessionId !== 'string' || !token.test(result.sessionId)) throw Error('invalid_response');
      if (operation === 'issue') {
        if (typeof result.nonce !== 'string' || !token.test(result.nonce) || typeof result.expiresAt !== 'number'
          || !Number.isSafeInteger(result.expiresAt) || result.expiresAt <= Date.now() || result.expiresAt > Date.now() + 600000) throw Error('invalid_response');
        session.current = { ...scope, sessionId: result.sessionId, nonce: result.nonce, expiresAt: result.expiresAt };
        setStarted(true); setMessage('Testforløbet er startet og gælder i højst 10 minutter. Bekræft den valgte printer på stedet.');
      } else {
        if (result.sessionId !== previous!.sessionId || result.jobId !== result.sessionId || result.trust !== 'supervised_operator'
          || typeof result.contentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(result.contentDigest)) throw Error('invalid_response');
        setComplete(true); setCapture(null); setMessage('Én testbon er klargjort. Printerens levering og papirudskrift skal bekræftes separat.');
      }
    } catch { if (current()) setMessage('Svaret kunne ikke bekræftes. Send ikke testbonen igen, før den eksisterende status er kontrolleret.'); }
    finally { if (current()) { pending.current = false; setBusy(false); request.current = null; } }
  }
  return <section aria-label="Kontrolleret testbon" className="border-t pt-4 space-y-3">
    <h3 className="font-semibold">Første testbon</h3>
    <p className="text-sm text-muted-foreground">Start kun i et aftalt testvindue ved printeren. Wolt-print må ikke forstyrres. Du bekræfter selv de observerede printeroplysninger. Der ændres ingen aktiveringsindstillinger her.</p>
    <p className="text-sm">{model === 'mc-print2' ? 'Star mC-Print2' : 'Star mC-Print3'} · {paperWidthMm} mm papir</p>
    {!active && <p role="status">Printeren skal først aktiveres gennem den godkendte printerhandling. Opdater derefter printeradgangen og start et nyt testforløb.</p>}
    {message && <p role="status">{message}</p>}
    {!complete && <Button variant="outline" disabled={!permitted || !active || busy} onClick={() => void submit('issue')}>{started ? 'Start nyt testforløb' : 'Start testforløb'}</Button>}
    {started && !complete && <fieldset disabled={!permitted || !active || busy} className="space-y-3">
      <label className="block text-sm">Operatørens navn eller ID<input className="block border rounded px-2 py-1 w-full" value={operator} maxLength={128} onChange={e => setOperator(e.target.value)} placeholder="Navn uden mellemrum" /></label>
      <label className="block text-sm">Modelnummer fra printerens mærkat<input className="block border rounded px-2 py-1 w-full" value={sku} maxLength={64} onChange={e => setSku(e.target.value)} /></label>
      <label className="block text-sm">Installeret firmware fra StarIO-kontrol<input className="block border rounded px-2 py-1 w-full" value={firmware} maxLength={11} onChange={e => setFirmware(e.target.value)} placeholder="Fx 3.2" /></label>
      <label className="block text-sm">Vælg lokal dokumentation<input className="block mt-1" type="file" onChange={e => void selectCapture(e.target.files?.[0])} /></label>
      <p className="text-xs text-muted-foreground">Dokumentationen bliver på din enhed. Kun dens kontrolsum registreres sammen med din bekræftelse.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={identified} onChange={e => setIdentified(e.target.checked)} />Jeg har kontrolleret printerens mærkat, installerede firmware og papirbredde på stedet.</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={correlated} onChange={e => setCorrelated(e.target.checked)} />Jeg har bekræftet, at denne fysiske printer svarer til den valgte printer i Orderfly.</label>
      <Button disabled={!identified || !correlated || !capture || captureBusy || !operator || !sku || !firmware || busy} onClick={() => void submit('attest')}>Bekræft og klargør én testbon</Button>
    </fieldset>}
  </section>;
}
