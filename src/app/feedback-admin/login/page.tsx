'use client';
import { useState } from 'react';
import { getApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function FeedbackLogin() {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  return <main className="mx-auto max-w-md space-y-5 px-5 py-16">
    <h1 className="text-2xl font-bold">Log ind til kvalitet og feedback</h1>
    <p>Brug din administratorkonto. Adgangen gælder de brands, du er tildelt.</p>
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault(); if (pending) return;
      const data = new FormData(event.currentTarget); setPending(true); setError('');
      const auth = getAuth(getApp());
      try {
        await setPersistence(auth, inMemoryPersistence);
        const user = await signInWithEmailAndPassword(auth, String(data.get('email')), String(data.get('password')));
        const response = await fetch('/api/feedback-admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: await user.user.getIdToken() }) });
        if (!response.ok) throw new Error();
        await signOut(auth);
        window.location.assign('/superadmin/feedback');
      } catch { setError('Kunne ikke logge ind. Kontrollér e-mail, adgangskode og din feedbackadgang.'); }
      finally { await signOut(auth).catch(() => {}); setPending(false); }
    }}>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" name="email" type="email" autoComplete="username" required disabled={pending} /></div>
      <div className="space-y-2"><Label htmlFor="password">Adgangskode</Label><Input id="password" name="password" type="password" autoComplete="current-password" required disabled={pending} /></div>
      <Button className="w-full" disabled={pending}>{pending ? 'Logger ind…' : 'Log ind'}</Button>
    </form>
  </main>;
}
