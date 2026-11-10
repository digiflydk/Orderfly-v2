'use server';

import { revalidatePath } from 'next/cache';
import { approveAndSendReply, discardReplyDraft, getReplyThread, saveReplyDraft, setReplyThreadStatus } from '@/lib/feedback/replies';

type Result = { ok: boolean; message?: string; thread?: Awaited<ReturnType<typeof getReplyThread>> };
// Known validation and state messages are shown as-is; anything else stays generic.
const SAFE = /^(Skriv|Svaret|Feedback findes|Du har ikke|Samtalen er|Der er ingen|Mail er ikke|Kunden|Dully-ordren|Feedback fra spisende|Afsendelsen er|Svaret kunne)/;
async function done(feedbackId: string, message: string, run: () => Promise<unknown>): Promise<Result> {
  try { await run(); } catch (error) {
    const text = error instanceof Error ? (error as any).issues?.[0]?.message || error.message : '';
    return { ok: false, message: SAFE.test(text) ? text : 'Handlingen kunne ikke gennemføres. Prøv igen.', thread: await getReplyThread(feedbackId).catch(() => undefined) };
  }
  try { revalidatePath(`/superadmin/feedback/${feedbackId}`); } catch {}
  return { ok: true, message, thread: await getReplyThread(feedbackId).catch(() => undefined) };
}
export async function saveReplyDraftAction(feedbackId: string, body: string, origin?: 'staff' | 'assistant') {
  return done(feedbackId, 'Kladden er gemt. Den er ikke sendt.', () => saveReplyDraft({ feedbackId, body, origin }));
}
export async function discardReplyDraftAction(feedbackId: string) {
  return done(feedbackId, 'Kladden er slettet.', () => discardReplyDraft(feedbackId));
}
export async function approveAndSendReplyAction(feedbackId: string, body: string, confirmed: boolean) {
  if (confirmed !== true) return { ok: false, message: 'Bekræft at teksten er godkendt, før den sendes.' } as Result;
  return done(feedbackId, 'Svaret er sendt til kunden.', () => approveAndSendReply({ feedbackId, body }));
}
export async function setReplyThreadStatusAction(feedbackId: string, status: 'open' | 'closed') {
  return done(feedbackId, status === 'closed' ? 'Samtalen er lukket. Kundens link virker ikke længere.' : 'Samtalen er genåbnet. Næste svar sender et nyt link.', () => setReplyThreadStatus(feedbackId, status));
}
