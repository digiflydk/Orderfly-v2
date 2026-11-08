'use client';

import { useEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { manualPrintResultSchema, type ManualPrintCommand } from '@/lib/printing/manual-print-schema';
import { useKdsLanguage } from './kds-language';

/** One deliberate tap creates a kitchen copy. An uncertain write keeps its ID. */
export function KitchenReprint({ orderId, brandId, locationId, apiEndpoint = '/api/merchant/orders/reprint', onAccessDenied, disabled = false, label }: {
  orderId: string; brandId: string; locationId: string; apiEndpoint?: string;
  onAccessDenied?: () => void; disabled?: boolean; label?: string;
}) {
  const { t } = useKdsLanguage();
  const scope = JSON.stringify([apiEndpoint, orderId, brandId, locationId]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const command = useRef<ManualPrintCommand | null>(null);
  const mounted = useRef(false);
  const pending = useRef(false), controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [state, setState] = useState(''), [denied, setDenied] = useState(false);
  const retryWrite = useRef(false);
  useEffect(() => {
    mounted.current = true;
    command.current = null; retryWrite.current = false; pending.current = false;
    setBusy(false); setMessage(''); setState(''); setDenied(false);
    return () => { mounted.current = false; controller.current?.abort(); };
  }, [scope]);

  async function print() {
    if (disabled || denied || pending.current) return;
    pending.current = true; setBusy(true); setMessage('');
    const origin = scope, request = new AbortController(); controller.current = request;
    const timeout = setTimeout(() => request.abort(), 25000);
    const valid = () => mounted.current && currentScope.current === origin && controller.current === request;
    async function read(url: string, init?: RequestInit) {
      const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store', signal: request.signal });
      if (!response.ok) throw Error(String(response.status));
      return response.json();
    }
    try {
      if (!command.current) {
        // Discovery is lazy: displaying many cards does not issue printer reads.
        const found: { id: string; revision: number }[] = [];
        let after: string | null = null;
        const cursors = new Set<string>();
        for (let page = 0; page < 4; page++) {
          const data = await read(apiEndpoint + '?' + new URLSearchParams({ orderId, brandId, locationId, ...(after ? { after } : {}) }));
          if (!valid()) return;
          if (!Array.isArray(data.items) || data.items.length > 50) throw Error('invalid_response');
          for (const item of data.items) {
            const c = item?.configuration;
            if (!c || c.brandId !== brandId || c.locationId !== locationId || (typeof c.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(c.id))
              || !Number.isSafeInteger(item.revision) || item.revision < 1) throw Error('invalid_response');
            if (c.state === 'active' && c.transport === 'cloudprnt-http') {
              if (found.some(p => p.id === c.id)) throw Error('invalid_response');
              found.push({ id: c.id, revision: item.revision });
            }
          }
          if (data.nextCursor === null) { after = null; break; }
          if (typeof data.nextCursor !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.nextCursor) || cursors.has(data.nextCursor)) throw Error('invalid_response');
          after = data.nextCursor; cursors.add(data.nextCursor);
        }
        if (after) throw Error('invalid_response');
        // Never guess between multiple physical printers or print several copies.
        if (found.length !== 1) throw Error(found.length ? 'multiple_printers' : 'no_printer');
        command.current = { orderId, brandId, locationId, kind: 'kitchen', printerId: found[0].id, printerRevision: found[0].revision, requestId: crypto.randomUUID() };
        retryWrite.current = true;
      }
      const target = command.current;
      const write = retryWrite.current;
      const result = await read(apiEndpoint + (write ? '' : '?' + new URLSearchParams(Object.entries(target).map(([k, v]) => [k, String(v)]))), write ? {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(target),
      } : undefined);
      if (!valid()) return;
      const parsed = manualPrintResultSchema.safeParse(result);
      if (!parsed.success || Object.entries(target).some(([k, v]) => result[k] !== v)) throw Error('invalid_response');
      retryWrite.current = false; setState(result.state);
      const messages: Record<string, string> = {
        queued: 'Genprint er lagt i kø. Afventer printeren.', offered: 'Printeren er ved at hente bonen.',
        download_started: 'Bonen er sendt. Afventer printerens svar.', confirmed: 'Printeren har meldt bonen udskrevet.',
        failed: 'Printeren meldte en fejl. Kontrollér papiret og printeren før et nyt genprint.',
        expired: 'Genprintet er udløbet. Kontrollér papiret før et nyt genprint.',
        unknown: 'Udskriftens resultat er ukendt. Kontrollér papiret før et nyt genprint.',
      };
      setMessage(messages[result.state]);
      if (['confirmed', 'failed', 'expired'].includes(result.state)) command.current = null;
    } catch (error) {
      if (!valid()) return;
      setState('');
      const code = error instanceof Error ? error.message : '';
      if (code === '401' || code === '403') { setDenied(true); onAccessDenied?.(); }
      setMessage(code === 'multiple_printers' ? 'Flere printere er tilknyttet. Administratoren skal konfigurere én printer til direkte køkkenprint.'
        : code === 'no_printer' ? 'Ingen printer er klar til genprint på denne lokation. Kontakt din administrator.'
        : code === '401' || code === '403' ? 'Du har ikke adgang til at genprinte denne ordre.'
        : 'Genprint kunne ikke bekræftes. Prøv igen med samme genprint.');
    } finally {
      clearTimeout(timeout);
      if (valid()) { pending.current = false; setBusy(false); }
    }
  }
  return <div className="space-y-2">
    <button type="button" aria-label={label || t('Genprint')} disabled={disabled || denied || busy} onClick={() => void print()}
      className="inline-flex min-h-12 items-center gap-2 rounded-xl border bg-white px-4 font-semibold disabled:opacity-50">
      <Printer aria-hidden="true" className="h-5 w-5" />{busy ? t('Arbejder…') : command.current && !retryWrite.current ? t('Opdater printstatus') : t('Genprint')}
    </button>
    {message && <p role={state ? 'status' : 'alert'} className="text-sm">{t(message)}</p>}
  </div>;
}
