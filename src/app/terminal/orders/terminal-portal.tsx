'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TerminalClient } from '@/app/merchant/orders/terminal-client';

type Session = { authenticated: true; brandId: string; brandName: string; locationId: string; locationName: string };
const validSession = (value: unknown): value is Session => !!value && typeof value === 'object' && (value as Session).authenticated === true && ['brandId', 'locationId', 'brandName', 'locationName'].every(key => typeof (value as Record<string, unknown>)[key] === 'string' && (value as Record<string, string>)[key].length > 0);

export function TerminalPortal({ loginHref = '/terminal/login' }: { loginHref?: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null), [message, setMessage] = useState('');
  const [checking, setChecking] = useState(true), [unavailable, setUnavailable] = useState(false);
  const [leaving, setLeaving] = useState(false), [logoutFailed, setLogoutFailed] = useState(false);
  const request = useRef<AbortController | null>(null), generation = useRef(0), loggingOut = useRef(false), logoutIntent = useRef(false);
  const checkSession = useCallback(async () => {
    if (logoutIntent.current || loggingOut.current || request.current) return;
    const current = ++generation.current, controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch('/api/terminal/auth/session', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
      if (current !== generation.current) return;
      if (response.status === 401 || response.status === 403) { setSession(null); setUnavailable(true); router.replace(loginHref); return; }
      if (!response.ok) throw new Error('unavailable');
      const value = await response.json();
      if (current !== generation.current) return;
      if (!validSession(value)) throw new Error('invalid_response');
      setSession(value); setUnavailable(false); setMessage('');
    } catch {
      if (current === generation.current) { setUnavailable(true); setMessage('Forbindelsen til terminalen kunne ikke bekræftes. Du er ikke logget ud. Kontrollér netværket, og prøv igen.'); }
    } finally {
      clearTimeout(timeout); if (request.current === controller) request.current = null;
      if (current === generation.current) setChecking(false);
    }
  }, [router, loginHref]);
  useEffect(() => {
    void checkSession();
    const wake = () => { if (document.visibilityState === 'visible') void checkSession(); };
    const timer = setInterval(wake, 5 * 60_000);
    window.addEventListener('focus', wake); window.addEventListener('online', wake); document.addEventListener('visibilitychange', wake);
    return () => { clearInterval(timer); generation.current++; request.current?.abort(); request.current = null; window.removeEventListener('focus', wake); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', wake); };
  }, [checkSession]);
  const logout = useCallback(async () => {
    if (loggingOut.current) return;
    loggingOut.current = true; logoutIntent.current = true; generation.current++; request.current?.abort(); request.current = null;
    setLeaving(true); setLogoutFailed(false); setMessage('');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch('/api/terminal/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('logout_unconfirmed');
      setSession(null); router.replace(loginHref);
    } catch { setLogoutFailed(true); setMessage('Log ud kunne ikke bekræftes. Ordrevisningen er skjult. Prøv Log ud igen, før du forlader denne iPad.'); }
    finally { clearTimeout(timeout); loggingOut.current = false; }
  }, [router, loginHref]);
  if (leaving) return <section className="mx-auto max-w-lg space-y-4 py-16"><h1 className="text-2xl font-bold">Log ud</h1>{logoutFailed ? <><p role="alert">{message}</p><button className="min-h-12 rounded-xl bg-slate-900 px-5 text-white" onClick={() => void logout()}>Prøv Log ud igen</button></> : <p role="status">Logger ud…</p>}</section>;
  if (checking) return <p role="status" className="p-8 text-center">Åbner ordreterminalen…</p>;
  if (unavailable || !session) return <section className="mx-auto max-w-lg space-y-4 py-16"><h1 className="text-2xl font-bold">Forbindelsen skal kontrolleres</h1><p role="alert">{message || 'Terminaladgangen kunne ikke bekræftes.'}</p><button className="min-h-12 rounded-xl bg-slate-900 px-5 text-white" onClick={() => void checkSession()}>Prøv igen</button>{session && <button className="ml-3 min-h-12 rounded-xl border px-5" onClick={() => void logout()}>Log ud</button>}</section>;
  return <TerminalClient key={`${session.brandId}/${session.locationId}`} fixedScope={{ brandId: session.brandId, locationId: session.locationId }} apiBase="/api/terminal/orders" loginHref={loginHref} onLogout={() => void logout()} onAccessDenied={checkSession} />;
}
