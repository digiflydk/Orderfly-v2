'use server';

import { loadGuestThread, submitGuestReply } from '@/lib/feedback/replies';

// Public: authorised only by the personal token from the guest's email.
export async function loadGuestThreadAction(token: string) {
  try { const thread = await loadGuestThread(String(token)); return thread ? { ok: true as const, thread } : { ok: false as const, message: 'Linket er udløbet, eller samtalen er lukket.' }; }
  catch { return { ok: false as const, message: 'Samtalen kunne ikke hentes. Prøv igen senere.' }; }
}
export async function submitGuestReplyAction(token: string, body: string) {
  try { await submitGuestReply({ token: String(token), body: String(body) }); }
  catch (error) {
    const text = error instanceof Error ? (error as any).issues?.[0]?.message || error.message : '';
    return { ok: false as const, message: /^(Skriv|Beskeden|Linket|Du har sendt)/.test(text) ? text : 'Beskeden kunne ikke sendes. Prøv igen senere.' };
  }
  return loadGuestThreadAction(token);
}
