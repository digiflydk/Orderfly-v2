'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import type { PrinterConfiguration } from '@/lib/printing/domain';

type Item = { configuration: PrinterConfiguration; revision: number };
type Props = { brandId: string; locationId: string; item?: Item; onSaved: () => void; onCancel: () => void; onSessionLost: () => void; permitted: boolean; onPendingChange: (pending: boolean) => void; onFeedback: (message: string, requiresRefresh: boolean) => void };
const identifier = /^[A-Za-z0-9_-]{1,128}$/;

export function PrinterConfigurationForm({ brandId, locationId, item, onSaved, onCancel, onSessionLost, permitted, onPendingChange, onFeedback }: Props) {
  const [printerId, setPrinterId] = useState(item?.configuration.id || '');
  const [name, setName] = useState(item?.configuration.name || '');
  const [description, setDescription] = useState(item?.configuration.description || '');
  const [model, setModel] = useState<PrinterConfiguration['model']>(item?.configuration.model || 'mc-print2');
  const [transport, setTransport] = useState<PrinterConfiguration['transport']>(item?.configuration.transport || 'cloudprnt-http');
  const [paperWidthMm, setPaperWidth] = useState<58 | 80>(item?.configuration.paperWidthMm || 58);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);

  function reportFailure(message: string, needsRefresh: boolean) {
    setMessage(message); setRefreshRequired(needsRefresh); onFeedback(message, needsRefresh);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    // Ref guards duplicate events before React has rendered the pending state.
    if (request.current || refreshRequired || !permitted) return;
    if (!identifier.test(printerId) || !name.trim() || name.trim().length > 80 || name.length > 160
      || /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(name)
      || (model === 'mc-print2' && (transport !== 'cloudprnt-http' || paperWidthMm !== 58))) {
      setMessage('Kontrollér printer-ID, navn, model, transport og papirbredde.'); return;
    }
    const configuration: PrinterConfiguration = { id: printerId, brandId, locationId, name: name.trim(), description: description.trim(), manufacturer: 'star', model, transport, state: 'disabled', paperWidthMm };
    const controller = new AbortController(); request.current = controller; onPendingChange(true); setPending(true); setMessage('');
    try {
      const response = await fetch('/api/merchant/printers', { method: item ? 'PATCH' : 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ configuration, ...(item ? { revision: item.revision } : {}) }) });
      if (!mounted.current || controller.signal.aborted) return;
      if (response.status === 401) { onSessionLost(); return; }
      if (!response.ok) {
        const writesOff = response.status === 503 && (await response.json().catch(() => null))?.error === 'writes_unavailable';
        if (!mounted.current || controller.signal.aborted) return;
        const messages: Record<number, string> = {
          400: 'Opsætningen blev afvist. Kontrollér felterne og prøv igen.',
          403: 'Du har ikke adgang til at gemme printere på denne lokation.',
          404: 'Printeren findes ikke længere. Opdater oversigten.',
          409: 'Printeren er ændret, eller ID er allerede brugt. Opdater oversigten før et nyt forsøg.',
          503: 'Lagring af printeropsætning er ikke tilgængelig. Funktionen kan være slået fra. Prøv igen senere.',
        };
        reportFailure((response.status === 503 && !writesOff ? undefined : messages[response.status]) || 'Kunne ikke bekræfte, om opsætningen blev gemt. Opdater oversigten før et nyt forsøg.',
          [403, 404, 409].includes(response.status) || ![400, 503].includes(response.status) || (response.status === 503 && !writesOff));
        return;
      }
      const result = await response.json();
      if (!mounted.current || controller.signal.aborted) return;
      if (response.status !== (item ? 200 : 201) || !result?.item
        || result.item.revision !== (item ? item.revision + 1 : 1)
        || Object.entries(configuration).some(([field, value]) => result.item.configuration?.[field] !== value)) {
        throw Error('invalid_response');
      }
      onSaved();
    } catch {
      if (mounted.current && !controller.signal.aborted) {
        reportFailure('Kunne ikke bekræfte, om opsætningen blev gemt. Opdater oversigten før et nyt forsøg.', true);
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current) { setPending(false); onPendingChange(false); }
    }
  }

  return <form onSubmit={submit} aria-label={item ? 'Rediger printer' : 'Tilføj printer'} className="rounded-lg border bg-card p-4 space-y-4 min-w-0">
    <h2 className="text-lg font-semibold">{item ? 'Rediger printer' : 'Tilføj printer'}</h2>
    <p className="text-sm text-muted-foreground">Gemmer kun en deaktiveret opsætning. Forbindelse og udskrift skal verificeres særskilt.</p>
    <fieldset disabled={pending || !permitted} className="grid gap-4 sm:grid-cols-2 min-w-0">
      <label className="grid gap-1.5 text-sm font-medium">Printer-ID<Input required maxLength={128} value={printerId} disabled={!!item} onChange={event => setPrinterId(event.target.value)} autoComplete="off" /></label>
      <label className="grid gap-1.5 text-sm font-medium">Printernavn<Input required maxLength={80} value={name} onChange={event => setName(event.target.value)} autoComplete="off" /></label>
      <label className="grid gap-1.5 text-sm font-medium">Beskrivelse<Input maxLength={160} value={description} onChange={event => setDescription(event.target.value)} /></label>
      <AdminSelectField className="w-full max-w-full" label="Printermodel" value={model} onChange={event => {
        const next = event.target.value as PrinterConfiguration['model']; setModel(next);
        if (next === 'mc-print2') { setTransport('cloudprnt-http'); setPaperWidth(58); }
      }}><option value="mc-print2">Star mC-Print2</option><option value="mc-print3">Star mC-Print3</option></AdminSelectField>
      <AdminSelectField className="w-full max-w-full" label="Printtransport" value={transport} onChange={event => setTransport(event.target.value as PrinterConfiguration['transport'])}>
        <option value="cloudprnt-http">CloudPRNT HTTP</option><option value="cloudprnt-mqtt" disabled={model === 'mc-print2'}>CloudPRNT MQTT (kræver model- og firmwarekontrol)</option>
      </AdminSelectField>
      <AdminSelectField className="w-full max-w-full" label="Papirbredde" value={paperWidthMm} onChange={event => setPaperWidth(Number(event.target.value) as 58 | 80)}>
        <option value="58">58 mm</option><option value="80" disabled={model === 'mc-print2'}>80 mm</option>
      </AdminSelectField>
      <p className="text-sm self-end pb-2">Driftsstatus: Deaktiveret</p>
    </fieldset>
    {message && <p role="alert" className="text-sm break-words">{message}</p>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={pending || refreshRequired || !permitted}>{pending ? 'Gemmer…' : 'Gem deaktiveret printer'}</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>{refreshRequired ? 'Opdater oversigten' : 'Annuller'}</Button>
    </div>
  </form>;
}
