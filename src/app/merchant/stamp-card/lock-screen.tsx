'use client';

import { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Login names of recent employees on this tablet. Never PINs.
const RECENT_KEY = 'orderfly.counter.recent';
export const FRESH_LOGIN_KEY = 'orderfly.counter.fresh-login';
const MAX_RECENT = 8;

export function readRecent(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT) : [];
  } catch { return []; }
}
function writeRecent(list: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT))); } catch { /* Private mode: nothing is remembered. */ }
}

// Shared-tablet login with the existing timeclock login (name/e-mail and 6-digit PIN).
export function LockScreen({ message, login: hooks }: { message?: string; login: { prepare: () => Promise<void>; settle: (ok: boolean) => void } }) {
  const [recent, setRecent] = useState(readRecent);
  const [identifier, setIdentifier] = useState(''), [chosen, setChosen] = useState<string | null>(null);
  const [pin, setPin] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('');
  const name = chosen ?? identifier;

  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (pending || name.trim().length < 2 || !/^\d{6}$/.test(pin)) return;
    setPending(true); setError('');
    let ok = false;
    try {
      await hooks.prepare();
      const response = await fetch('/api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'opsfly', identifier: name.trim(), pin }) });
      if (!response.ok) {
        setPin('');
        setError(response.status === 429 ? 'For mange forsøg. Vent 10 minutter, og prøv igen.'
          : response.status === 503 ? 'Ingen forbindelse. Prøv igen.' : 'Kunne ikke logge ind. Kontrollér navn og PIN.');
        return;
      }
      ok = true;
      writeRecent([name.trim(), ...recent.filter(r => r.toLocaleLowerCase('da') !== name.trim().toLocaleLowerCase('da'))]);
      try { sessionStorage.setItem(FRESH_LOGIN_KEY, '1'); } catch { /* The idle timer then starts from the stored activity. */ }
      window.location.assign('/merchant/stamp-card');
    } catch { setError('Ingen forbindelse. Prøv igen.'); }
    finally { hooks.settle(ok); setPending(false); }
  }

  const forget = (value: string) => { const next = recent.filter(r => r !== value); writeRecent(next); setRecent(next); };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <section aria-labelledby="lock-title" className="w-full max-w-lg rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <Lock className="h-7 w-7 text-primary" aria-hidden />
          <h1 id="lock-title" className="text-2xl font-bold">Kassevisning</h1>
        </div>
        {message && <p role="status" className="mb-4 rounded-lg border bg-muted p-3 text-base">{message}</p>}
        {chosen === null ? (
          <>
            {recent.length > 0 && (
              <div className="mb-6">
                <p className="mb-3 text-base font-medium">Vælg dit navn</p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {recent.map(value => (
                    <li key={value} className="flex items-stretch gap-1">
                      <Button type="button" variant="outline" className="h-16 flex-1 justify-start truncate text-lg" onClick={() => { setChosen(value); setError(''); }}>{value}</Button>
                      <Button type="button" variant="ghost" className="h-16 px-3" aria-label={`Fjern ${value} fra listen`} onClick={() => forget(value)}><X className="h-5 w-5" /></Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form onSubmit={event => { event.preventDefault(); if (identifier.trim().length >= 2) setChosen(identifier.trim()); }} className="grid gap-3">
              <Label htmlFor="counter-identifier" className="text-base">{recent.length ? 'Anden medarbejder' : 'Navn eller e-mail'}</Label>
              <Input id="counter-identifier" autoComplete="username" maxLength={160} value={identifier} onChange={e => setIdentifier(e.target.value)} className="h-14 text-lg" />
              <Button type="submit" className="h-14 text-lg" disabled={identifier.trim().length < 2}>Fortsæt</Button>
            </form>
          </>
        ) : (
          <form onSubmit={login} className="grid gap-4">
            <p className="text-lg">Logger ind som <strong>{chosen}</strong></p>
            <Label htmlFor="counter-pin" className="text-base">6-cifret PIN</Label>
            <Input id="counter-pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" maxLength={6} autoFocus
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="h-16 text-center text-3xl tracking-[0.5em]" />
            {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-base text-destructive">{error}</p>}
            <Button type="submit" className="h-16 text-xl" disabled={pending || pin.length !== 6}>{pending ? 'Logger ind…' : 'Log ind'}</Button>
            <Button type="button" variant="outline" className="h-14 text-lg" disabled={pending} onClick={() => { setChosen(null); setPin(''); setError(''); }}>Tilbage</Button>
          </form>
        )}
      </section>
    </main>
  );
}
