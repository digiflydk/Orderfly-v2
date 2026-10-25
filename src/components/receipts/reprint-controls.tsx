'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type Scope = { orderId: string; brandId: string; locationId: string; kind: 'kitchen' | 'customer' };
type Printer = { id: string; name: string; revision: number; connected: boolean; endpoint: 'live' | 'test' | null };
type Command = Scope & { printerId: string; printerRevision: number; requestId: string };
type PrintState = 'queued' | 'offered' | 'download_started' | 'confirmed' | 'failed' | 'unknown' | 'expired';
type Result = Command & { state: PrintState };
const endpoint = '/api/superadmin/printers/reprint';
const states: Record<PrintState, string> = {
  queued: 'Genprint er lagt i kø. Afventer printeren.',
  offered: 'Printeren er ved at hente bonen.',
  download_started: 'Bonen er sendt. Afventer printerens svar.',
  confirmed: 'Printeren har meldt bonen udskrevet.',
  failed: 'Printeren meldte en fejl. Kontrollér papiret og printeren før et nyt genprint.',
  unknown: 'Udskriftens resultat er ukendt. Kontrollér papiret før et nyt genprint.',
  expired: 'Genprintet er udløbet. Kontrollér papiret før et nyt genprint.',
};
const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const canRequestNewCopy = (state?: PrintState) => state === 'confirmed' || state === 'failed' || state === 'expired';

async function json(response: Response, limit: number): Promise<any> {
  const reader = response.body?.getReader();
  if (!reader) throw Error('invalid_response');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw Error('invalid_response'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

/** Explicit physical reprints only. A retry retains the same request identity;
 * status polling cannot create jobs and an ambiguous write never resets it. */
export function ReprintControls(props: Scope) {
  const scopeKey = JSON.stringify(props);
  const [printers, setPrinters] = useState<Printer[]>([]), [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [listError, setListError] = useState(''), [message, setMessage] = useState('');
  const [command, setCommand] = useState<Command | null>(null), [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(false), [sessionLost, setSessionLost] = useState(false), [refresh, setRefresh] = useState(0);
  const generation = useRef(0), pending = useRef(false), activeRequest = useRef<AbortController | null>(null);
  const currentScope = useRef(scopeKey); currentScope.current = scopeKey;

  useEffect(() => {
    const version = ++generation.current, controller = new AbortController();
    pending.current = false; activeRequest.current?.abort();
    setLoading(true); setBusy(false); setPrinters([]); setSelected(''); setListError(''); setMessage('');
    setCommand(null); setResult(null); setRetry(false); setSessionLost(false);
    const isCurrent = () => generation.current === version && currentScope.current === scopeKey && !controller.signal.aborted;
    async function load() {
      const found: Printer[] = []; let after: string | null = null;
      // Bounded native pages; fail visibly rather than silently hiding printers.
      for (let page = 0; page < 4; page++) {
        const query = new URLSearchParams({ brandId: props.brandId, locationId: props.locationId, overview: 'true', limit: '50', ...(after ? { after } : {}) });
        const response = await fetch('/api/merchant/printers?' + query, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw Error(String(response.status));
        const data = await json(response, 131072);
        if (!Array.isArray(data.items) || data.items.length > 50 || !(data.nextCursor === null || typeof data.nextCursor === 'string' && identifier.test(data.nextCursor))) throw Error('invalid_response');
        for (const item of data.items) {
          const c = item?.configuration;
          if (!c || c.brandId !== props.brandId || c.locationId !== props.locationId || typeof c.id !== 'string' || !identifier.test(c.id)
            || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 80 || !Number.isSafeInteger(item.revision) || item.revision < 1
            || typeof item.connection?.connected !== 'boolean' || ![null, 'test', 'live'].includes(item.connection?.endpoint)) throw Error('invalid_response');
          if (c.state === 'active' && c.transport === 'cloudprnt-http') {
            if (found.some(p => p.id === c.id)) throw Error('invalid_response');
            found.push({ id: c.id, name: c.name, revision: item.revision, connected: item.connection.connected, endpoint: item.connection.endpoint });
          }
        }
        if (!data.nextCursor) {
          if (isCurrent()) { setPrinters(found); if (found.length === 1) setSelected(found[0].id); }
          return;
        }
        if (data.nextCursor === after) throw Error('invalid_response');
        after = data.nextCursor;
      }
      throw Error('too_many_printers');
    }
    load().catch(error => {
      if (!isCurrent()) return;
      const code = error instanceof Error ? error.message : '';
      if (code === '401' || code === '403') setSessionLost(true);
      setListError(code === '401' ? 'Din session er udløbet. Log ind igen.' : code === '403' ? 'Du har ikke adgang til printerne på denne lokation.'
        : 'Printerne kunne ikke indlæses. Prøv igen.');
    }).finally(() => { if (isCurrent()) setLoading(false); });
    return () => { generation.current++; controller.abort(); activeRequest.current?.abort(); };
  }, [scopeKey, refresh]); // All order/scope changes invalidate pending UI responses.

  async function perform(method: 'GET' | 'POST', target: Command) {
    if (pending.current || sessionLost) return;
    const version = generation.current, originScope = scopeKey;
    pending.current = true; setBusy(true); setMessage('');
    const controller = new AbortController(); activeRequest.current = controller;
    const isCurrent = () => version === generation.current && currentScope.current === originScope && !controller.signal.aborted;
    try {
      const query = new URLSearchParams(Object.entries(target).map(([key, value]) => [key, String(value)]));
      const response = await fetch(endpoint + (method === 'GET' ? '?' + query : ''), { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(target) } : {}) });
      if (!response.ok) throw Error(String(response.status));
      const data = await json(response, 8192);
      if (!isCurrent()) return;
      if (!data || Object.entries(target).some(([key, value]) => data[key] !== value) || !Object.hasOwn(states, data.state)) throw Error('invalid_response');
      setResult(data); setRetry(false);
    } catch (error) {
      if (!isCurrent()) return;
      const code = error instanceof Error ? error.message : '';
      if (code === '401' || code === '403') setSessionLost(true);
      // A transport failure can happen after enqueue. Keep the ID for safe recovery.
      if (method === 'POST') setRetry(!['400', '401', '403', '409'].includes(code));
      setMessage(code === '401' ? 'Din session er udløbet. Log ind igen.' : code === '403' ? 'Du har ikke adgang til at genprinte denne ordre.'
        : code === '409' ? 'Genprint kunne ikke fortsætte. Kontrollér printerens status og opsætning.'
        : code === '400' ? 'Genprint blev afvist. Genindlæs siden og kontrollér printervalget.'
        : 'Resultatet er ukendt. Opdater printstatus. Et nyt forsøg bruger samme genprint og opretter ikke en ekstra kopi.');
    } finally { if (isCurrent()) { pending.current = false; setBusy(false); } }
  }
  function submit() {
    if (pending.current || loading || sessionLost) return;
    if (retry && command) { void perform('POST', command); return; }
    if (command && !canRequestNewCopy(result?.state)) return;
    const printer = printers.find(p => p.id === selected); if (!printer) return;
    const next = { ...props, printerId: printer.id, printerRevision: printer.revision, requestId: crypto.randomUUID() };
    setCommand(next); setResult(null); setRetry(false);
    void perform('POST', next);
  }
  useEffect(() => {
    if (!command || !result || !['queued', 'offered', 'download_started'].includes(result.state) || sessionLost) return;
    const timer = setInterval(() => void perform('GET', command), 5000);
    return () => clearInterval(timer);
  }, [command, result?.state, sessionLost, scopeKey]);

  const printer = printers.find(p => p.id === selected);
  const unresolved = !!command && !canRequestNewCopy(result?.state);
  return <section aria-label="Genprint" className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm font-medium">Printer
        <select aria-label="Printer til genprint" className="min-h-10 max-w-full rounded-md border bg-background px-3 py-2" value={selected}
          disabled={loading || busy || unresolved || sessionLost} onChange={event => setSelected(event.target.value)}>
          <option value="">{loading ? 'Indlæser printere…' : printers.length ? 'Vælg printer' : 'Ingen aktive printere'}</option>
          {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <Button type="button" disabled={loading || busy || sessionLost || !printer || unresolved && !retry} onClick={submit}>
        {busy ? 'Arbejder…' : retry ? 'Prøv samme genprint igen' : canRequestNewCopy(result?.state) ? 'Genprint igen' : props.kind === 'kitchen' ? 'Genprint køkkenbon' : 'Genprint kvittering'}
      </Button>
      {command && <Button type="button" variant="outline" disabled={busy || sessionLost} onClick={() => void perform('GET', command)}>Opdater printstatus</Button>}
      {!command && !loading && !sessionLost && <Button type="button" variant="outline" onClick={() => setRefresh(value => value + 1)}>Opdater printere</Button>}
    </div>
    <p className="text-sm text-muted-foreground">Udskriver en ekstra kopi med det aktuelle bonlayout. Printeren skal have papir og bruge Live URL.</p>
    {printer && (!printer.connected || printer.endpoint !== 'live') && <p className="text-sm">{printer.endpoint === 'test'
      ? 'Printeren bruger Test URL. Skift til Live URL for at modtage genprint.'
      : !printer.connected ? 'Printeren er ikke registreret som forbundet. Kontrollér forbindelsen.' : 'Der er endnu ikke registreret kontakt via Live URL.'}</p>}
    {!loading && !printers.length && !listError && <p className="text-sm">Opret eller aktivér en printer på denne lokation under System → Printere.</p>}
    {result && <p role="status">{states[result.state]}</p>}
    {(listError || message) && <p role="alert">{listError || message}</p>}
  </section>;
}
