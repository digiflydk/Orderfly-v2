'use client';

import { useState } from 'react';

export function ExternalReviewInvitation({ links, language }: {
  links: { googleReviewUrl: string; trustpilotReviewUrl: string }; language: 'da' | 'en';
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || (!links.googleReviewUrl && !links.trustpilotReviewUrl)) return null;
  const da = language === 'da';
  return <section aria-label={da ? 'Del din oplevelse' : 'Share your experience'} className="mt-8 border-t border-current/20 pt-6">
    <h2 className="text-xl font-semibold">{da ? 'Vil du dele din oplevelse?' : 'Would you like to share your experience?'}</h2>
    <p className="mt-3 text-size-regular text-[var(--feedback-muted)]">{da ? 'Du kan også skrive en anmeldelse på Google eller Trustpilot. Det er helt frivilligt.' : 'You can also leave a review on Google or Trustpilot. It is entirely optional.'}</p>
    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {links.googleReviewUrl && <a className="button inline-flex min-h-11 items-center justify-center" href={links.googleReviewUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{da ? 'Anmeld på Google' : 'Review on Google'}</a>}
      {links.trustpilotReviewUrl && <a className="button inline-flex min-h-11 items-center justify-center" href={links.trustpilotReviewUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{da ? 'Anmeld på Trustpilot' : 'Review on Trustpilot'}</a>}
      <button type="button" className="min-h-11 rounded-md px-4 py-2 underline underline-offset-4 focus-visible:outline focus-visible:outline-2" onClick={() => setDismissed(true)}>{da ? 'Nej tak' : 'No thanks'}</button>
    </div>
  </section>;
}
