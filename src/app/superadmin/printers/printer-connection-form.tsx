'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdminSelectField } from '@/components/superadmin/admin-select-field';
import { PrinterPilotAddress } from './printer-pilot-address';
import { PrinterConnectionSecret } from './printer-connection-secret';
import type { PrinterConfiguration } from '@/lib/printing/domain';
type Location = { id: string; brandId: string; name: string };
type Result = { item: { configuration: PrinterConfiguration; revision: number }; username: string; secret: string };
export function PrinterConnectionForm({ brands, locations, onClose, onSessionLost }: {
  brands: { id: string; name: string }[]; locations: Location[]; onClose: () => void; onSessionLost: () => void;
}) {
  const [brand, setBrand] = useState(''), [location, setLocation] = useState('');
  const [name, setName] = useState(''), [description, setDescription] = useState('');
  const [model, setModel] = useState('mc-print3'), [width, setWidth] = useState(80);
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const busy = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const allowed = locations.some(l => l.id === location && l.brandId === brand);
  const allowedRef = useRef(allowed); allowedRef.current = allowed;
  useEffect(() => { if (!allowed && result) { setResult(null); setUncertain(true); setError('Adgangen til lokationen er ændret. Gå tilbage til oversigten.'); } }, [allowed, result]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy.current || uncertain || !allowed) return;
    busy.current = true; setPending(true); setError('');
    const command = { brandId: brand, locationId: location, name: name.trim(), description: description.trim(), manufacturer: 'star', model, paperWidthMm: width };
    try {
      const response = await fetch('/api/superadmin/printers/connections', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      if (!mounted.current) return;
      if (response.status === 401) { onSessionLost(); return; }
      if (response.status === 400 || response.status === 403) { setError(response.status === 400 ? 'Kontrollér felterne og prøv igen.' : 'Du har ikke adgang til at oprette printeren her.'); return; }
      if (response.status !== 201) throw Error('unconfirmed');
      const data = await response.json() as Result, c = data?.item?.configuration;
      if (!c || !/^prn_[A-Za-z0-9_-]+$/.test(c.id) || data.item.revision !== 1 || c.state !== 'active' || c.transport !== 'cloudprnt-http'
        || Object.entries(command).some(([key, value]) => c[key as keyof PrinterConfiguration] !== value)
        || data.username !== 'orderfly' || !/^[A-Za-z0-9_-]{43}$/.test(data.secret)) throw Error('unconfirmed');
      if (!mounted.current) return;
      if (!allowedRef.current) throw Error('unconfirmed');
      setResult(data);
    } catch { if (mounted.current) { setUncertain(true); setError('Oprettelsen kunne ikke bekræftes. Gå til oversigten og kontrollér, om printeren er oprettet, før du forsøger igen.'); } }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  if (result && allowed) return <section aria-label="Printerforbindelse oprettet" className="rounded-xl border bg-card p-5 space-y-5 min-w-0">
    <div><h2 className="text-xl font-semibold">{result.item.configuration.name} er oprettet</h2><p className="mt-1 text-sm text-muted-foreground">Kopiér adgangskoden og Test URL til printerens CloudPRNT-indstillinger.</p></div>
    <p className="text-sm">Tryk Færdig for at se forbindelsesstatus i oversigten.</p>
    <PrinterConnectionSecret secret={result.secret} />
    <PrinterPilotAddress scope={{ brandId: brand, locationId: location, printerId: result.item.configuration.id }} showUsername={false} />
    <Button onClick={() => { setResult(null); onClose(); }}>Færdig</Button>
  </section>;
  return <form onSubmit={submit} aria-label="Ny printerforbindelse" className="rounded-xl border bg-card p-5 space-y-5 min-w-0">
    <div><h2 className="text-xl font-semibold">Ny printerforbindelse</h2><p className="mt-1 text-sm text-muted-foreground">Vælg placering og printer. Brugernavn, adgangskode og adresser oprettes automatisk.</p></div>
    <fieldset disabled={pending || uncertain || !!result} className="grid gap-4 sm:grid-cols-2 min-w-0">
      <AdminSelectField label="Brand" value={brand} required onChange={e => { setBrand(e.target.value); setLocation(''); }}><option value="">Vælg brand</option>{brands.filter(b => locations.some(l => l.brandId === b.id)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</AdminSelectField>
      <AdminSelectField label="Lokation" value={location} required disabled={!brand} onChange={e => setLocation(e.target.value)}><option value="">Vælg lokation</option>{locations.filter(l => l.brandId === brand).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</AdminSelectField>
      <label className="grid gap-1.5 text-sm font-medium">Printernavn<Input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Fx Køkken" /></label>
      <label className="grid gap-1.5 text-sm font-medium">Beskrivelse<Input maxLength={160} value={description} onChange={e => setDescription(e.target.value)} placeholder="Valgfri beskrivelse" /></label>
      <AdminSelectField label="Printermærke" value="star" onChange={() => {}}><option value="star">Star Micronics</option></AdminSelectField>
      <AdminSelectField label="Model" value={model} onChange={e => { setModel(e.target.value); if (e.target.value === 'mc-print2') setWidth(58); }}><option value="mc-print3">mC-Print3</option><option value="mc-print2">mC-Print2</option></AdminSelectField>
      <AdminSelectField label="Bonstørrelse" value={width} onChange={e => setWidth(Number(e.target.value))}><option value={58}>58 mm</option><option value={80} disabled={model === 'mc-print2'}>80 mm</option></AdminSelectField>
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {result && !allowed && <p role="alert">Adgangen til lokationen er ændret. Luk og opdater oversigten.</p>}
    <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending || uncertain || !allowed || !!result}>{pending ? 'Opretter…' : 'Opret'}</Button><Button type="button" variant="outline" disabled={pending} onClick={onClose}>{uncertain ? 'Gå til oversigten' : 'Annuller'}</Button></div>
  </form>;
}
