'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkoutReturnKey, CHECKOUT_RETURN_TTL, safeCheckoutReturn, readCheckoutReturn } from './checkout-return';
import { CheckEmail } from '../check-email';
import { portalErrorText, portalRequest } from '../portal-api';

type State = { step: 'starting' | 'form' | 'verifying' } | { step: 'sent'; email: string }
  | { step: 'expired' | 'invalid' } | { step: 'failed'; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Login (spec §4.2): request a link by e-mail, or sign in with the link from the
// mail. The one-time token is read from the address fragment and removed from
// the address before anything else happens; the API sets the session cookie.
export function LoginFlow({ slug, base, programName, signedIn }: { slug: string; base: string; programName: string; signedIn: boolean }) {
  const [state, setState] = useState<State>({ step: 'starting' });
  const [email, setEmail] = useState(''), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const token = useRef<string | null>(null), started = useRef(false);
  const [checkoutReturn, setCheckoutReturn] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const verify = useCallback(async () => {
    setState({ step: 'verifying' });
    const answer = await portalRequest(slug, 'verify', { token: token.current });
    if (answer.ok) {
      token.current = null;
      let target: string | null = null;
      try { target = readCheckoutReturn(window.localStorage, slug, base, Date.now()); window.localStorage.removeItem(checkoutReturnKey(slug)); } catch {}
      window.location.replace(target || base); return;
    }
    if (answer.error === 'link_expired' || answer.error === 'link_invalid') {
      token.current = null;
      setState({ step: answer.error === 'link_expired' ? 'expired' : 'invalid' });
      return;
    }
    setState({ step: 'failed', message: portalErrorText(answer.error) });
  }, [slug, base]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const hash = window.location.hash;
    if (hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    const requested = new URLSearchParams(window.location.search).get('returnTo');
    const safe = safeCheckoutReturn(requested, slug, base);
    try {
      if (safe) window.localStorage.setItem(checkoutReturnKey(slug), JSON.stringify({ path: safe, expiresAt: Date.now() + CHECKOUT_RETURN_TTL }));
      else if (requested !== null) window.localStorage.removeItem(checkoutReturnKey(slug));
      setCheckoutReturn(readCheckoutReturn(window.localStorage, slug, base, Date.now()));
    } catch {}
    if (!hash) { setState({ step: 'form' }); return; }
    const match = /^#token=([a-f0-9]{64})$/.exec(hash);
    if (!match) { setState({ step: 'invalid' }); return; }
    token.current = match[1];
    void verify();
  }, [verify]);

  useEffect(() => { if (state.step !== 'starting' && state.step !== 'verifying') heading.current?.focus(); }, [state.step]);

  async function requestLink(event: React.FormEvent) {
    event.preventDefault();
    if (!EMAIL.test(email.trim())) { setError('Skriv en gyldig e-mail.'); document.getElementById('club-login-email')?.focus(); return; }
    setError(null); setBusy(true);
    const answer = await portalRequest(slug, 'login-link', { email: email.trim() });
    setBusy(false);
    if (answer.ok) setState({ step: 'sent', email: email.trim() });
    else setError(portalErrorText(answer.error));
  }

  const newLink = <Button type="button" variant="brand" size="lg" className="min-h-12 text-base" onClick={() => setState({ step: 'form' })}>Send mig et nyt link</Button>;

  if (state.step === 'starting' || state.step === 'verifying') {
    return <p role="status" className="text-center">{state.step === 'verifying' ? 'Logger ind…' : 'Øjeblik…'}</p>;
  }
  if (state.step === 'sent') return <><CheckEmail email={state.email} onRetry={() => setState({ step: 'form' })} />{checkoutReturn && <p className="text-center">Åbn login-linket i samme browser for at vende tilbage til din kurv.</p>}</>;
  if (state.step === 'expired' || state.step === 'invalid') {
    return (
      <section aria-labelledby="club-link" className="flex flex-col gap-4 text-center">
        <h1 id="club-link" ref={heading} tabIndex={-1} className="text-3xl outline-none">{state.step === 'expired' ? 'Linket er udløbet' : 'Linket virker ikke længere'}</h1>
        <p>{state.step === 'expired'
          ? 'Et login-link virker i 15 minutter. Få et nyt link, så kan du logge ind.'
          : 'Et login-link kan kun bruges én gang. Få et nyt link, så kan du logge ind.'}</p>
        {newLink}
      </section>
    );
  }
  if (state.step === 'failed') {
    return (
      <section aria-labelledby="club-failed" className="flex flex-col gap-4 text-center">
        <h1 id="club-failed" ref={heading} tabIndex={-1} className="text-3xl outline-none">Vi kunne ikke logge dig ind</h1>
        <p role="alert">{state.message}</p>
        <Button type="button" variant="brand" size="lg" className="min-h-12 text-base" onClick={() => void verify()}>Prøv igen</Button>
      </section>
    );
  }

  return (
    <form onSubmit={requestLink} noValidate aria-labelledby="club-login" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 text-center">
        <h1 id="club-login" ref={heading} tabIndex={-1} className="text-3xl outline-none">Log ind på {programName}</h1>
        <p>Skriv din e-mail, så sender vi dig et login-link.</p>
      </div>
      {signedIn && <p className="rounded-md border p-3 text-center">Du er allerede logget ind. <a href={checkoutReturn || base} className="underline underline-offset-4">{checkoutReturn ? 'Tilbage til kassen' : 'Gå til dit stempelkort'}</a></p>}
      <div className="flex flex-col gap-2">
        <Label htmlFor="club-login-email" className="text-base">E-mail</Label>
        <Input id="club-login-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={email}
          onChange={e => setEmail(e.target.value)} aria-invalid={!!error} aria-describedby={error ? 'club-login-error' : undefined} className="h-12 text-base" />
        {error && <p id="club-login-error" role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <Button type="submit" variant="brand" size="lg" disabled={busy} className="min-h-12 text-base">{busy ? 'Øjeblik…' : 'Send login-link'}</Button>
      <p className="text-center">Ikke medlem endnu? <a href={`${base}/tilmeld`} className="underline underline-offset-4">Bliv medlem</a></p>
    </form>
  );
}
