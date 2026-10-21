'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { PrinterConfiguration } from '@/lib/printing/domain';

type Item = { configuration: PrinterConfiguration; revision: number };
export function PrinterLifecycleDialog({ item, action, permitted, onPendingChange, onCancel, onSessionLost, onFeedback, onSaved }: {
  item: Item; action: 'deactivate' | 'delete'; permitted: boolean; onPendingChange: (pending: boolean) => void;
  onCancel: () => void; onSessionLost: () => void; onFeedback: (message: string, refresh: boolean) => void; onSaved: () => void;
}) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState(''), [refreshRequired, setRefreshRequired] = useState(false);
  const request = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  const deleted = action === 'delete', label = deleted ? 'Slet printer' : 'Deaktiver printer';
  async function submit() {
    if (request.current || !permitted || refreshRequired) return;
    const controller = new AbortController(); request.current = controller; setPending(true); onPendingChange(true); setMessage('');
    const fail = (text: string, refresh: boolean) => { setMessage(text); setRefreshRequired(refresh); onFeedback(text, refresh); };
    try {
      const c = item.configuration;
      const response = await fetch('/api/merchant/printers/lifecycle', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ brandId: c.brandId, locationId: c.locationId, printerId: c.id, revision: item.revision, action }) });
      if (!mounted.current || controller.signal.aborted) return;
      if (response.status === 401) { onSessionLost(); return; }
      if (!response.ok) {
        const writesOff = response.status === 503 && (await response.json().catch(() => null))?.error === 'writes_unavailable';
        if (!mounted.current || controller.signal.aborted) return;
        const messages: Record<number, string> = {
          400: 'Handlingen blev afvist. Opdater oversigten.', 403: 'Du har ikke adgang til denne printerhandling. Opdater oversigten.',
          404: 'Printeren findes ikke længere. Opdater oversigten.', 409: 'Printeren er ændret. Opdater oversigten før et nyt forsøg.',
        };
        fail(writesOff ? 'Printerændringer er slået fra. Prøv igen senere.' : messages[response.status]
          || 'Kunne ikke bekræfte printerhandlingen. Opdater oversigten før et nyt forsøg.', !writesOff); return;
      }
      const value = await response.json();
      if (!mounted.current || controller.signal.aborted) return;
      const valid = response.status === 200 && (deleted
        ? value?.deleted === true && value.printerId === c.id && value.revision === item.revision + 1
        : value?.item?.revision === item.revision + 1 && Object.entries({ ...c, state: 'disabled' }).every(([key, v]) => value.item.configuration?.[key] === v));
      if (!valid) throw Error('invalid_response');
      onSaved();
    } catch {
      if (mounted.current && !controller.signal.aborted) fail('Kunne ikke bekræfte printerhandlingen. Opdater oversigten før et nyt forsøg.', true);
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current) { setPending(false); onPendingChange(false); }
    }
  }
  return <section role="dialog" aria-modal="false" aria-label={label} className="rounded-lg border bg-card p-4 space-y-4 min-w-0">
    <h2 className="text-lg font-semibold">{label}: {item.configuration.name}</h2>
    <p className="text-sm text-muted-foreground">{deleted ? 'Printeren fjernes fra oversigten. Historik og tidligere printjobs bevares.' : 'Printeren deaktiveres. Historik og eksisterende printjobs bevares.'}</p>
    {message && <p role="alert">{message}</p>}
    <div className="flex flex-wrap gap-3"><Button disabled={pending || !permitted || refreshRequired} onClick={submit}>{pending ? 'Gemmer…' : label}</Button>
      <Button variant="outline" disabled={pending} onClick={onCancel}>{refreshRequired ? 'Opdater oversigten' : 'Annuller'}</Button></div>
  </section>;
}
