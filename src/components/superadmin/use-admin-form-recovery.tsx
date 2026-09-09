'use client';

import { useEffect, useState } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { isMissingServerAction } from '@/lib/server-action-error';
import { Button } from '@/components/ui/button';

const draftKey = () => `orderfly:admin-form-recovery:${window.location.pathname}`;
const maxAge = 15 * 60 * 1000;

// Keep edits in this tab only, and only when the user requests recovery.
// A failed mutation is never replayed automatically.
export function useAdminFormRecovery<T extends FieldValues>(form: UseFormReturn<T>) {
  const [message, setMessage] = useState('');
  const [needsReload, setNeedsReload] = useState(false);

  useEffect(() => {
    let removalTimer: number | undefined;
    try {
      const raw = sessionStorage.getItem(draftKey());
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.version !== 1 || typeof draft.savedAt !== 'number'
          || Date.now() - draft.savedAt > maxAge || draft.savedAt > Date.now()
          || !draft.values || typeof draft.values !== 'object' || Array.isArray(draft.values)) return;
      const current = form.getValues();
      // The route's loaded document remains authoritative for identity.
      form.reset({ ...current, ...draft.values, id: current.id });
      setMessage('Dine ændringer er gendannet. Kontrollér oplysningerne og tryk Gem igen.');
      // React Strict Mode replays mount effects in development. Delay removal so
      // the replay can restore the same draft after the form's own reset effect.
      removalTimer = window.setTimeout(() => {
        try {
          if (sessionStorage.getItem(draftKey()) === raw) sessionStorage.removeItem(draftKey());
        } catch {
          // Storage can become unavailable after the draft was read.
        }
      }, 0);
    } catch {
      // Storage can be disabled. The normal form must still work.
    }
    return () => {
      if (removalTimer !== undefined) window.clearTimeout(removalTimer);
    };
  }, [form]);

  function handleSaveError(error: unknown) {
    // Successful server actions use a Next redirect to return to the list.
    if (error && typeof error === 'object' && 'digest' in error
        && String(error.digest).startsWith('NEXT_REDIRECT;')) throw error;
    const missingAction = isMissingServerAction(error);
    setNeedsReload(missingAction);
    setMessage(missingAction
      ? 'Siden er blevet opdateret, siden du åbnede den. Genindlæs den med dine ændringer, og tryk derefter Gem igen.'
      : 'Vi kunne ikke bekræfte, at ændringerne blev gemt. Dine oplysninger er stadig i formularen.');
  }

  function reloadWithDraft() {
    try {
      sessionStorage.setItem(draftKey(), JSON.stringify({ version: 1, savedAt: Date.now(), values: form.getValues() }));
    } catch {
      setMessage('Browseren kan ikke bevare ændringerne ved genindlæsning. Kopiér dine ændringer, før du genindlæser siden manuelt.');
      return;
    }
    window.location.reload();
  }

  return {
    handleSaveError,
    clearSaveError: () => { setMessage(''); setNeedsReload(false); },
    recoveryNotice: message ? (
      <div role="alert" className="rounded-md border p-4 space-y-3">
        <p>{message}</p>
        {needsReload && <Button type="button" variant="outline" onClick={reloadWithDraft}>Genindlæs med mine ændringer</Button>}
      </div>
    ) : null,
  };
}
