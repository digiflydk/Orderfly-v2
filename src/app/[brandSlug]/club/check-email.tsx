'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

// The same answer whether or not the e-mail is known, so the portal never reveals membership.
export function CheckEmail({ email, onRetry }: { email: string; onRetry: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <section aria-labelledby="club-check-email" className="flex flex-col gap-4 text-center">
      <h1 id="club-check-email" ref={heading} tabIndex={-1} className="text-3xl outline-none">Tjek din e-mail</h1>
      <p>Vi har sendt et login-link til <strong className="break-all">{email}</strong>, hvis adressen kan bruges.</p>
      <p>Linket virker i 15 minutter og kan kun bruges én gang.</p>
      <Button type="button" variant="outline" size="lg" className="min-h-12 text-base" onClick={onRetry}>Har du ikke fået en mail? Prøv igen</Button>
    </section>
  );
}
