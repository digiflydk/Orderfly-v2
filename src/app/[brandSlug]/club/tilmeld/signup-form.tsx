'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignupBenefits, type SignupCampaigns } from '../club-benefits';
import { CheckEmail } from '../check-email';
import { portalErrorText, portalRequest } from '../portal-api';

type Program = { name: string; consentText: string; consentHelp: string; termsAccept: string; consentVersion: string; termsVersion: string; campaigns?: SignupCampaigns | null };
type Errors = Partial<Record<'name' | 'email' | 'consent' | 'terms' | 'form', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sign-up (spec §4.1). Neither box is pre-ticked; consent is given only when
// "Bliv medlem" is pressed, with exactly the text and versions shown here.
export function SignupForm({ slug, base, program }: { slug: string; base: string; program: Program }) {
  const router = useRouter();
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false), [terms, setTerms] = useState(false);
  // The word "vilkårene" in the acceptance text links to the terms (shown in a new tab).
  const termsHref = `${base}/vilkaar`, at = program.termsAccept.indexOf('vilkårene');
  const linked = at < 0 ? null : [program.termsAccept.slice(0, at), program.termsAccept.slice(at + 'vilkårene'.length)] as const;
  const [errors, setErrors] = useState<Errors>({}), [busy, setBusy] = useState(false), [sentTo, setSentTo] = useState<string | null>(null);
  const shown = useRef(program);
  const summary = useRef<HTMLParagraphElement>(null);

  // New text or advertised campaign versions from the server require fresh ticks.
  useEffect(() => {
    if (shown.current.consentVersion === program.consentVersion && shown.current.termsVersion === program.termsVersion
      && shown.current.campaigns?.version === program.campaigns?.version) return;
    shown.current = program; setConsent(false); setTerms(false);
  }, [program]);
  useEffect(() => { if (errors.form) summary.current?.focus(); }, [errors.form]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!name.trim()) next.name = 'Skriv dit navn.';
    if (!EMAIL.test(email.trim())) next.email = 'Skriv en gyldig e-mail.';
    if (!consent) next.consent = 'Du skal give samtykke til nyhedsbrevet for at blive medlem.';
    if (!terms) next.terms = 'Du skal acceptere vilkårene for at blive medlem.';
    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(`club-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    const answer = await portalRequest(slug, 'signup', { name: name.trim(), email: email.trim(), newsletterConsent: true, termsAccepted: true,
      consentVersion: program.consentVersion, termsVersion: program.termsVersion, campaignVersion: program.campaigns?.version });
    setBusy(false);
    if (answer.ok) { setSentTo(email.trim()); return; }
    if (answer.error === 'program_changed') {
      setErrors({ form: 'Teksterne er blevet opdateret, eller kampagnefordelene har ændret sig. Læs dem igen, og sæt dine flueben.' });
      router.refresh();
      return;
    }
    setErrors({ form: portalErrorText(answer.error) });
  }

  if (sentTo) return <CheckEmail email={sentTo} onRetry={() => setSentTo(null)} />;

  const describedBy = (field: keyof Errors) => errors[field] ? `club-${field}-error` : undefined;
  const fieldError = (field: keyof Errors) => errors[field] && <p id={`club-${field}-error`} className="text-sm text-destructive">{errors[field]}</p>;

  return (
    <form onSubmit={submit} noValidate aria-labelledby="club-signup" className="flex flex-col gap-5">
      <div className="text-center">
        <h1 id="club-signup" className="text-3xl">Bliv medlem af {program.name}</h1>
      </div>
      <SignupBenefits campaigns={program.campaigns} />
      {errors.form && <p ref={summary} tabIndex={-1} role="alert" className="rounded-md border border-destructive p-3 text-destructive outline-none">{errors.form}</p>}
      <div className="flex flex-col gap-2">
        <Label htmlFor="club-name" className="text-base">Navn</Label>
        <Input id="club-name" name="name" autoComplete="name" required maxLength={100} value={name} onChange={e => setName(e.target.value)}
          aria-invalid={!!errors.name} aria-describedby={describedBy('name')} className="h-12 text-base" />
        {fieldError('name')}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="club-email" className="text-base">E-mail</Label>
        <Input id="club-email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} value={email}
          onChange={e => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={describedBy('email')} className="h-12 text-base" />
        {fieldError('email')}
      </div>
      <div className="flex flex-col gap-2">
        <div className="commerce-newsletter flex items-start gap-3 rounded-xl border p-4">
          <Checkbox id="club-consent" checked={consent} onCheckedChange={value => setConsent(value === true)} className="mt-1 h-5 w-5"
            aria-invalid={!!errors.consent} aria-describedby={describedBy('consent')} />
          <Label htmlFor="club-consent" className="whitespace-pre-line text-base font-normal leading-relaxed">{program.consentText}</Label>
        </div>
        {program.consentHelp && <p id="club-consent-help" className="whitespace-pre-line text-sm leading-relaxed opacity-80">{program.consentHelp}</p>}
        {fieldError('consent')}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Checkbox id="club-terms" checked={terms} onCheckedChange={value => setTerms(value === true)} className="mt-1 h-5 w-5"
            aria-invalid={!!errors.terms} aria-describedby={describedBy('terms')} />
          <Label htmlFor="club-terms" className="text-base font-normal leading-relaxed">
            {linked ? <>{linked[0]}<a href={termsHref} target="_blank" rel="noopener" className="underline underline-offset-4">vilkårene</a>{linked[1]}</> : program.termsAccept}
          </Label>
        </div>
        {!linked && <a href={termsHref} target="_blank" rel="noopener" className="ml-8 self-start py-2 underline underline-offset-4">Læs vilkårene</a>}
        {fieldError('terms')}
      </div>
      <Button type="submit" variant="brand" size="lg" disabled={busy} className="min-h-12 text-base">{busy ? 'Øjeblik…' : 'Bliv medlem'}</Button>
      <p className="text-center">Er du allerede medlem? <a href={`${base}/login`} className="underline underline-offset-4">Log ind</a></p>
    </form>
  );
}
