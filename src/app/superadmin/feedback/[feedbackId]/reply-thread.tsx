'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ReplyThreadView } from '@/lib/feedback/replies';
import { approveAndSendReplyAction, discardReplyDraftAction, saveReplyDraftAction, setReplyThreadStatusAction } from './reply-actions';

const time = (at: number) => at ? new Date(at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }) : '–';
const stateText: Record<string, string> = { sent: 'Sendt', sending: 'Sendes', failed: 'Fejlede', uncertain: 'Uafklaret', received: 'Modtaget' };

export function ReplyThread({ feedbackId, initial, canEdit }: { feedbackId: string; initial: ReplyThreadView; canEdit: boolean }) {
  const [thread, setThread] = useState(initial);
  const [body, setBody] = useState(initial.draft?.body || '');
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const closed = thread.status === 'closed';
  const run = (action: () => Promise<{ ok: boolean; message?: string; thread?: ReplyThreadView }>, after?: (ok: boolean) => void) => start(async () => {
    const result = await action().catch(() => ({ ok: false, message: 'Handlingen kunne ikke gennemføres. Prøv igen.' }) as { ok: boolean; message?: string; thread?: ReplyThreadView });
    setNotice(result);
    if (result.thread) setThread(result.thread);
    after?.(result.ok);
  });
  return <Card data-testid="reply-thread"><CardHeader><CardTitle>Svar til kunden</CardTitle>
    <p className="text-sm text-muted-foreground">{thread.canReply ? `Sendes til ${thread.recipient}. Kunden kan svare via et personligt link i mailen.` : thread.reason}</p></CardHeader>
    <CardContent className="space-y-4">
      {thread.messages.length > 0 && <ol className="space-y-3" aria-label="Samtale">{thread.messages.map(m => <li key={m.id} className={`rounded-lg border p-3 text-sm ${m.direction === 'guest' ? 'bg-muted/40' : ''}`}>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><strong className="text-foreground">{m.direction === 'guest' ? 'Kunden' : 'Jer'}</strong><span>{time(m.at)}</span>{m.direction === 'staff' && <Badge variant={m.state === 'sent' ? 'secondary' : 'destructive'}>{stateText[m.state] || m.state}</Badge>}{m.origin === 'assistant' && <Badge variant="outline">Udkast fra Claude</Badge>}</div>
        <p className="whitespace-pre-line break-words">{m.body}</p></li>)}</ol>}
      {thread.canReply && !closed && <div className="space-y-3">
        <div className="space-y-2"><Label htmlFor="reply-body">{thread.draft ? (thread.draft.origin === 'assistant' ? 'Kladde fra Claude – læs og ret før afsendelse' : 'Kladde') : 'Nyt svar'}</Label>
          <Textarea id="reply-body" rows={8} maxLength={5000} value={body} disabled={!canEdit || pending} onChange={e => { setBody(e.target.value); setConfirmed(false); }} />
          <p className="text-xs text-muted-foreground">Skriv uden hilsen til sidst – mailen tilføjer selv afsenderens hilsen. Lov kun det, der allerede er gjort (fx en refundering).</p></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={confirmed} disabled={!canEdit || pending || !body.trim()} onChange={e => setConfirmed(e.target.checked)} /><span>Jeg har læst svaret og godkender, at det sendes til kunden.</span></label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!canEdit || pending || !body.trim()} onClick={() => run(() => saveReplyDraftAction(feedbackId, body))}>Gem kladde</Button>
          <Button type="button" disabled={!canEdit || pending || !body.trim() || !confirmed} onClick={() => run(() => approveAndSendReplyAction(feedbackId, body, confirmed), ok => { if (ok) { setBody(''); setConfirmed(false); } })}>Godkend og send</Button>
          {thread.draft && <Button type="button" variant="outline" disabled={!canEdit || pending} onClick={() => run(() => discardReplyDraftAction(feedbackId), ok => { if (ok) setBody(''); })}>Slet kladde</Button>}
        </div></div>}
      {thread.status !== 'none' && <Button type="button" variant="outline" size="sm" disabled={!canEdit || pending} onClick={() => run(() => setReplyThreadStatusAction(feedbackId, closed ? 'open' : 'closed'))}>{closed ? 'Genåbn samtale' : 'Luk samtale'}</Button>}
      {closed && <p className="text-sm text-muted-foreground">Samtalen er lukket. Kundens link virker ikke.</p>}
      {notice?.message && <p role={notice.ok ? 'status' : 'alert'} className="text-sm">{notice.message}</p>}
    </CardContent></Card>;
}
