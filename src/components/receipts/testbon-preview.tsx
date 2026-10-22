'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function TestBonPreview({ model = 'mc-print3', paperWidthMm = 80 }: {
  model?: 'mc-print2' | 'mc-print3'; paperWidthMm?: 58 | 80;
}) {
  const initial = `${model}:${model === 'mc-print2' ? 58 : paperWidthMm}`;
  const [profile, setProfile] = useState(initial);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ url?: string; error?: boolean }>({});
  useEffect(() => setProfile(initial), [initial]);
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setResult({});
    const [printerModel, width] = profile.split(':');
    fetch(`/api/superadmin/receipts/testbon?model=${printerModel}&paperWidthMm=${width}`, {
      signal: abort.signal, cache: 'no-store', credentials: 'same-origin',
    }).then(async response => {
      if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png') throw Error('preview');
      const blob = await response.blob();
      if (abort.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setResult({ url: objectUrl });
    }).catch(() => { if (!abort.signal.aborted) setResult({ error: true }); });
    return () => { abort.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [profile, attempt]);
  return <section id="testbon" className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">Printerens faste testbon</h2>
    <p className="text-sm text-muted-foreground">Samme billede som i printertesten. Visningen sender intet til printeren. Kvitteringsindstillingerne ændrer ikke denne testbon; papirfremføring og fysisk kvalitet kontrolleres ved et rigtigt testprint.</p>
    <label className="flex flex-col gap-2 text-sm">Printer og papirbredde
      <select aria-label="Printer og papirbredde" className="rounded-md border bg-background p-2" value={profile} onChange={event => setProfile(event.target.value)}>
        <option value="mc-print2:58">Star mC-Print2 · 58 mm</option>
        <option value="mc-print3:58">Star mC-Print3 · 58 mm</option>
        <option value="mc-print3:80">Star mC-Print3 · 80 mm</option>
      </select>
    </label>
    {!result.url && !result.error && <p role="status">Henter testbon…</p>}
    {result.error && <div role="alert">Testbonnen kunne ikke hentes. <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Prøv igen</Button></div>}
    {result.url && <img src={result.url} alt="Fast syntetisk Orderfly-testbon med danske bogstaver" className="mx-auto h-auto max-w-full border bg-white" style={{ width: profile.endsWith(':58') ? 288 : 384, imageRendering: 'pixelated' }} />}
  </section>;
}
