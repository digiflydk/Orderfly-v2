'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
export function PrinterConnectionSecret({ secret }: { secret: string }) {
  const [visible, setVisible] = useState(false), [copied, setCopied] = useState('');
  return <div className="rounded-lg bg-muted/40 p-4 space-y-3 min-w-0">
    <p className="text-sm">Brugernavn: <code>orderfly</code></p>
    <label className="block text-sm font-medium">Adgangskode<input aria-label="Engangsvist adgangskode" type={visible ? 'text' : 'password'} readOnly value={secret}
      autoComplete="off" className="mt-1 block w-full min-w-0 rounded border bg-background p-2 font-mono" onFocus={e => e.target.select()} /></label>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setVisible(v => !v)}>{visible ? 'Skjul adgangskode' : 'Vis adgangskode'}</Button>
      <Button type="button" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(secret); setCopied('Adgangskoden er kopieret.'); } catch { setCopied('Vis og markér adgangskoden for at kopiere den.'); } }}>Kopiér adgangskode</Button></div>
    {copied && <p role="status" className="text-sm">{copied}</p>}
    <p className="text-xs text-muted-foreground">Kopiér koden til printeren nu. Når du lukker, kan du kun oprette en ny kode.</p>
  </div>;
}
