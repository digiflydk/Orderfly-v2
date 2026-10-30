'use client';
import { useEffect, useId, useState } from 'react';
import { Loader2, X } from 'lucide-react';

/** Nonmodal popup: typing keeps focus and dismissal never cancels provider work. */
export function ManagedDeliveryLoading({pending, requestIdentity}: {pending: boolean; requestIdentity: string}) {
  const headingId = useId(), descriptionId = useId();
  const [dismissedIdentity, setDismissedIdentity] = useState<string | null>(null);
  const visible = pending && dismissedIdentity !== requestIdentity;
  useEffect(() => { if (!pending) setDismissedIdentity(null); }, [pending]);
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setDismissedIdentity(requestIdentity); };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [visible, requestIdentity]);
  if (!visible) return null;
  return <aside role="dialog" aria-modal="false" aria-labelledby={headingId} aria-describedby={descriptionId}
    className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border bg-background p-4 text-foreground shadow-xl sm:bottom-6">
    <div className="flex items-start gap-3">
      <Loader2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none" />
      <div className="min-w-0 flex-1"><p id={headingId} role="status" aria-live="polite" className="font-semibold">Henter leveringsprisen…</p>
        <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">Du kan fortsætte med at udfylde dine oplysninger.</p></div>
      <button type="button" aria-label="Skjul beskeden" onClick={() => setDismissedIdentity(requestIdentity)}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"><X aria-hidden="true" className="h-5 w-5" /></button>
    </div>
  </aside>;
}
