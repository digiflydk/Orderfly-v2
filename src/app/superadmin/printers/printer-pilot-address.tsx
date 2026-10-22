'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/** Nonsecret setup information remains available after activation/rotation. */
export function PrinterPilotAddress({ scope, showUsername = true }: {
  scope: Readonly<{ brandId: string; locationId: string; printerId: string }>; showUsername?: boolean;
}) {
  const [url, setUrl] = useState(''), [message, setMessage] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setUrl(window.location.protocol === 'https:' ? window.location.origin + '/api/cloudprnt-pilot/'
      + [scope.brandId, scope.locationId, scope.printerId].map(encodeURIComponent).join('/') : '');
    setMessage('');
  }, [scope.brandId, scope.locationId, scope.printerId]);
  async function copy() {
    try { await navigator.clipboard.writeText(url); if (mounted.current) setMessage('Printeradressen er kopieret. Adgangskoden skal indtastes separat.'); }
    catch { if (mounted.current) setMessage('Markér og kopiér printeradressen fra feltet.'); }
  }
  return <div className="space-y-2">
    {showUsername && <p className="text-sm">Brugernavn i printeren: <code>orderfly</code>. Adgangskoden indtastes separat fra Printeradgang.</p>}
    {url ? <><label className="block text-sm">CloudPRNT-pilotadresse<input aria-label="CloudPRNT-pilotadresse" readOnly value={url} className="block border rounded w-full px-2 py-1" onFocus={event => event.target.select()} /></label>
      <Button variant="outline" onClick={() => void copy()}>Kopiér printeradresse</Button></>
      : <p className="text-sm">Åbn administrationen via HTTPS for at få den sikre printeradresse.</p>}
    {message && <p role="status">{message}</p>}
  </div>;
}
