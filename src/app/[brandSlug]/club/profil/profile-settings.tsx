'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { portalErrorText, portalRequest } from '../portal-api';

type Props = {
  slug: string; base: string; programName: string;
  member: { name: string; email: string };
  newsletter: { subscribed: boolean; consentVersion: string; consentText: string; consentHelp: string };
};

// Profile and settings (spec §4.5). Each change goes through the phase 1 API;
// unsubscribing keeps the membership, stamps and rewards.
export function ProfileSettings({ slug, base, programName, member, newsletter }: Props) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(newsletter.subscribed);
  const [busy, setBusy] = useState<null | 'consent' | 'logout' | 'delete'>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [deleted, setDeleted] = useState(false);

  const unauthorized = (error: string) => { if (error === 'unauthorized') { window.location.assign(`${base}/login`); return true; } return false; };

  async function setNewsletter(next: boolean) {
    setBusy('consent'); setMessage(null);
    const answer = await portalRequest<{ subscribed: boolean }>(slug, 'consent', next ? { subscribed: true, consentVersion: newsletter.consentVersion } : { subscribed: false });
    setBusy(null);
    if (answer.ok) {
      setSubscribed(answer.data.subscribed);
      setMessage({ text: answer.data.subscribed ? 'Du er tilmeldt nyhedsbrevet.' : 'Du er afmeldt nyhedsbrevet. Dit medlemskab og dine stempler er bevaret.', error: false });
      return;
    }
    if (unauthorized(answer.error)) return;
    if (answer.error === 'program_changed') { router.refresh(); setMessage({ text: 'Teksten er blevet opdateret. Læs den, og prøv igen.', error: true }); return; }
    setMessage({ text: portalErrorText(answer.error), error: true });
  }

  async function logout() {
    setBusy('logout');
    const answer = await portalRequest(slug, 'logout', {});
    // A session that is already gone is as good as logged out.
    if (answer.ok || answer.error === 'unauthorized') { window.location.assign(base); return; }
    setBusy(null); setMessage({ text: portalErrorText(answer.error), error: true });
  }

  async function deleteMembership() {
    setBusy('delete'); setMessage(null);
    const answer = await portalRequest(slug, 'delete', { confirm: true });
    setBusy(null);
    if (answer.ok) { setDeleted(true); return; }
    if (unauthorized(answer.error)) return;
    setMessage({ text: portalErrorText(answer.error), error: true });
  }

  if (deleted) {
    return (
      <section aria-labelledby="club-deleted" className="flex flex-col gap-4 text-center">
        <h1 id="club-deleted" className="text-3xl">Dit medlemskab er slettet</h1>
        <p>Vi har slettet dit medlemskab af {programName}. Du er velkommen tilbage når som helst.</p>
        <a href={base} className="self-center py-2 underline underline-offset-4">Til forsiden</a>
      </section>
    );
  }

  return (
    <div className="club-member-profile flex flex-col gap-6">
      <h1 className="text-center text-3xl">Profil</h1>
      {message && <p role={message.error ? 'alert' : 'status'} className={`rounded-md border p-3 text-center ${message.error ? 'border-destructive text-destructive' : ''}`}>{message.text}</p>}

      <section aria-labelledby="club-profile-details" className="flex flex-col gap-2 rounded-xl border p-4">
        <h2 id="club-profile-details" className="text-xl">Dine oplysninger</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>Navn</dt><dd className="break-words">{member.name}</dd>
          <dt>E-mail</dt><dd className="break-all">{member.email}</dd>
        </dl>
      </section>

      <section aria-labelledby="club-newsletter" className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 id="club-newsletter" className="text-xl">Nyhedsbrev</h2>
        <p><strong>{subscribed ? 'Du er tilmeldt nyhedsbrevet.' : 'Du er ikke tilmeldt nyhedsbrevet.'}</strong></p>
        <p>Du beholder dit medlemskab, dine stempler og dine belønninger, selv om du afmelder nyhedsbrevet.</p>
        {subscribed ? (
          <Button type="button" variant="outline" size="lg" className="min-h-12 text-base" disabled={busy !== null} onClick={() => setNewsletter(false)}>
            {busy === 'consent' ? 'Øjeblik…' : 'Afmeld nyhedsbrevet'}
          </Button>
        ) : newsletter.consentText ? (
          <>
            <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
              <p className="whitespace-pre-line">{newsletter.consentText}</p>
              {newsletter.consentHelp && <p className="whitespace-pre-line opacity-80">{newsletter.consentHelp}</p>}
            </div>
            <Button type="button" variant="brand" size="lg" className="min-h-12 text-base" disabled={busy !== null} onClick={() => setNewsletter(true)}>
              {busy === 'consent' ? 'Øjeblik…' : 'Tilmeld nyhedsbrevet'}
            </Button>
          </>
        ) : <p>Du kan ikke tilmelde dig nyhedsbrevet lige nu.</p>}
      </section>

      <section aria-labelledby="club-account" className="flex flex-col gap-3 rounded-xl border p-4">
        <h2 id="club-account" className="text-xl">Medlemskab</h2>
        <a href={`${base}/vilkaar`} className="self-start py-2 underline underline-offset-4">Læs vilkårene for {programName}</a>
        <Button type="button" variant="outline" size="lg" className="min-h-12 text-base" disabled={busy !== null} onClick={logout}>
          {busy === 'logout' ? 'Logger ud…' : 'Log ud'}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="ghost" size="lg" className="min-h-12 text-base underline underline-offset-4" disabled={busy !== null}>Slet medlemskab</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Slet dit medlemskab?</AlertDialogTitle>
              <AlertDialogDescription>
                Dine stempler og belønninger går tabt og kan ikke genskabes. Du bliver logget ud på alle enheder.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Behold medlemskab</AlertDialogCancel>
              <AlertDialogAction onClick={deleteMembership} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Ja, slet mit medlemskab</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
}
