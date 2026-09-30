'use client';
import { useState } from 'react';
import { savePaymentMethods } from './actions';
import type { LocationPaymentMethods } from '@/lib/merchant-payment-methods';
import { Button } from '@/components/ui/button';

type PaymentLocation = { id: string; name: string; editable: boolean; paymentMethods: LocationPaymentMethods };
function LocationSettings({ location }: { location: PaymentLocation }) {
  const [methods, setMethods] = useState(location.paymentMethods), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  return <form className="rounded-lg border p-5 space-y-4" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    try { const result = await savePaymentMethods(location.id, methods); setMessage(result.message); }
    catch { setMessage('Betalingsmetoderne kunne ikke gemmes. Prøv igen.'); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-lg font-semibold">{location.name}</h2>
    <fieldset disabled={busy || !location.editable} className="space-y-3">
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={methods.online} onChange={event => setMethods(old => ({ ...old, online: event.target.checked }))} className="h-5 w-5" />Online betaling</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={methods.payAtPickup} onChange={event => setMethods(old => ({ ...old, payAtPickup: event.target.checked }))} className="h-5 w-5" />Betal ved afhentning</label>
      {!methods.online && !methods.payAtPickup && <p role="alert">Mindst én betalingsmetode skal være aktiv.</p>}
      <Button disabled={!methods.online && !methods.payAtPickup} type="submit">{busy ? 'Gemmer…' : 'Gem betalingsmetoder'}</Button>
    </fieldset>
    {!location.editable && <p>Du har læseadgang til denne restaurants indstillinger.</p>}
    {message && <p role="status">{message}</p>}
  </form>;
}
export function PaymentSettings({ locations }: { locations: PaymentLocation[] }) {
  return <div className="grid gap-5 lg:grid-cols-2">{locations.length ? locations.map(location => <LocationSettings key={location.id} location={location} />) : <p>Ingen tilgængelige restauranter.</p>}</div>;
}
