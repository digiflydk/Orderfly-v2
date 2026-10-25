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
    {showUsername && <p className="text-sm">Brugernavn: <code>orderfly</code></p>}
    {url ? <><label className="block text-sm">Test URL<input aria-label="CloudPRNT-pilotadresse" readOnly value={url} className="block border rounded w-full px-2 py-1" onFocus={event => event.target.select()} /></label>
      <Button variant="outline" onClick={() => void copy(url)}>Kopiér Test URL</Button>
      <p className="text-sm">Test URL bruges til valgfrit testprint.</p>
      <label className="block text-sm">Live URL<input aria-label="CloudPRNT-ordre-adresse" readOnly value={orderUrl} className="block border rounded w-full px-2 py-1" onFocus={event => event.target.select()} /></label>
      <Button variant="outline" onClick={() => void copy(orderUrl)}>Kopiér Live URL</Button>
      <p className="text-xs text-muted-foreground">Live URL er klar til opsætning. Ordreprint kræver aktivering af autoprint. En testbon er ikke nødvendig.</p></>
      : <p className="text-sm">Åbn administrationen via HTTPS for at få den sikre printeradresse.</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
