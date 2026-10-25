'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function TerminalLogin() {
  const router = useRouter();
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch('/api/terminal/auth/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }), signal: controller.signal });
      const result = await response.json();
      setPassword('');
      if (response.ok && result.authenticated === true) { router.replace('/terminal/orders'); return; }
      setError(response.status === 429 ? 'For mange loginforsøg. Vent lidt, og prøv igen.' : response.status >= 500 ? 'Login er ikke tilgængeligt lige nu. Prøv igen.' : 'Login kunne ikke bekræftes. Kontrollér brugernavn og adgangskode.');
    } catch { setPassword(''); setError('Forbindelsen blev afbrudt. Kontrollér netværket, og prøv igen.'); }
    finally { clearTimeout(timeout); pending.current = false; setBusy(false); }
  }
  return <section className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center" aria-labelledby="terminal-login-heading">
    <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">Orderfly</p>
    <h1 id="terminal-login-heading" className="mt-3 text-3xl font-bold">Log ind på ordreterminalen</h1>
    <p className="mt-3 text-slate-600">Brug restaurantens terminal-login. Denne iPad forbliver logget ind, indtil du logger ud, eller administratoren nulstiller adgangen.</p>
    <form onSubmit={login} className="mt-7 space-y-5">
      <label className="block font-semibold">Brugernavn<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} value={username} onChange={event => setUsername(event.target.value)} disabled={busy} className="mt-2 min-h-14 w-full rounded-xl border px-4 py-3 font-normal" /></label>
      <label className="block font-semibold">Adgangskode<input name="password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} className="mt-2 min-h-14 w-full rounded-xl border px-4 py-3 font-normal" /></label>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">{error}</p>}
      <button type="submit" disabled={busy} className="min-h-14 w-full rounded-xl bg-slate-900 px-5 py-4 text-lg font-semibold text-white disabled:opacity-50">{busy ? 'Logger ind…' : 'Log ind'}</button>
    </form>
    <p className="mt-5 text-sm text-slate-500">Brug en almindelig browserfane. Privat browsing eller sletning af browserdata kan kræve et nyt login.</p>
  </section>;
}
