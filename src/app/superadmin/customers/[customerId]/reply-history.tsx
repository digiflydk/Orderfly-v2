import Link from '@/components/superadmin/admin-link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReplyMessageView } from '@/lib/feedback/replies';

const time = (at: number) => at ? new Date(at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short' }) : '–';

/** Conversations with this customer about their feedback (#901). Shown only to readers with feedback access. */
export function ReplyHistory({ threads }: { threads: Array<{ feedbackId: string; comment: string; messages: ReplyMessageView[] }> }) {
  if (!threads.length) return null;
  return <Card data-testid="customer-reply-history"><CardHeader><CardTitle>Samtaler om feedback</CardTitle></CardHeader>
    <CardContent className="space-y-5">{threads.map(t => <section key={t.feedbackId} className="space-y-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="max-w-prose break-words text-muted-foreground">{t.comment ? `“${t.comment}”` : 'Feedback uden kommentar'}</p><Link href={`/superadmin/feedback/${encodeURIComponent(t.feedbackId)}`} className="text-primary hover:underline">Åbn feedback</Link></div>
      <ol className="space-y-2">{t.messages.map(m => <li key={m.id} className={`rounded-md p-3 text-sm ${m.direction === 'guest' ? 'bg-muted/40' : 'border'}`}>
        <p className="mb-1 text-xs text-muted-foreground">{m.direction === 'guest' ? 'Kunden' : 'Jer'} · {time(m.at)}{m.direction === 'staff' && m.state !== 'sent' ? ` · ${m.state === 'failed' ? 'Fejlede' : m.state === 'uncertain' ? 'Uafklaret' : m.state}` : ''}</p>
        <p className="whitespace-pre-line break-words">{m.body}</p></li>)}</ol>
    </section>)}</CardContent></Card>;
}
