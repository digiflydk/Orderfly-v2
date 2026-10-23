'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Nonsecret setup information remains available after activation/rotation. */
export function PrinterPilotAddress({ scope, showUsername = true }: {
  scope: Readonly<{ brandId: string; locationId: string; printerId: string }>; showUsername?: boolean;
}) {
  const [url, setUrl] = useState(''), [message, setMessage] = useState('');
  const orderUrl = url.replace('/api/cloudprnt-pilot/', '/api/cloudprnt/');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setUrl(window.location.protocol === 'https:' ? window.location.origin + '/api/cloudprnt-pilot/'
      + [scope.brandId, scope.locationId, scope.printerId].map(encodeURIComponent).join('/') : '');
    setMessage('');
  }, [scope.brandId, scope.locationId, scope.printerId]);
  async function copy(address: string) {
    try { await navigator.clipboard.writeText(address); if (mounted.current) setMessage('Printeradressen er kopieret. Adgangskoden skal indtastes separat.'); }
    catch { if (mounted.current) setMessage('Markér og kopiér printeradressen fra feltet.'); }
  }
  return <div className="space-y-2">
    {showUsername && <p className="text-sm">Brugernavn i printeren: <code>orderfly</code>. Adgangskoden indtastes separat fra Printeradgang.</p>}
    {url ? <><label className="block text-sm">CloudPRNT-pilotadresse<input aria-label="CloudPRNT-pilotadresse" readOnly value={url} className="block border rounded w-full px-2 py-1" onFocus={event => event.target.select()} /></label>
      <Button variant="outline" onClick={() => void copy(url)}>Kopiér printeradresse</Button>
      <p className="text-sm">Brug pilotadressen til den første testbon. Efter testbonen og papir-kontrollen kan du åbne et testvindue for køb og skifte til ordre-adressen.</p>
      <label className="block text-sm">CloudPRNT-ordre-adresse<input aria-label="CloudPRNT-ordre-adresse" readOnly value={orderUrl} className="block border rounded w-full px-2 py-1" onFocus={event => event.target.select()} /></label>
      <Button variant="outline" onClick={() => void copy(orderUrl)}>Kopiér ordre-adresse</Button>
      <p className="text-xs text-muted-foreground">Ordre-adressen giver kun udskrifter, når et godkendt testvindue er åbent og serverens udskriftsindstilling er aktiveret.</p></>
      : <p className="text-sm">Åbn administrationen via HTTPS for at få den sikre printeradresse.</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
