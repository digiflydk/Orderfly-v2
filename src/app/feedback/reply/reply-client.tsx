'use client';

import { useEffect, useState, useTransition } from 'react';
import { loadGuestThreadAction, submitGuestReplyAction } from './actions';

type Thread = { brandName: string; messages: Array<{ direction: 'staff' | 'guest'; body: string; at: number }> };
const time = (at: number) => at ? new Date(at).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'medium', timeStyle: 'short' }) : '';

export function GuestReplyClient() {
  const [token, setToken] = useState('');
  const [thread, setThread] = useState<Thread | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();
  useEffect(() => {
    // The token is read from the URL fragment, which browsers never send to the server or to analytics.
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    setToken(value);
    if (!/^[a-f0-9]{64}$/.test(value)) { setMessage('Linket er ugyldigt. Brug knappen i mailen.'); return; }
    start(async () => { const r = await loadGuestThreadAction(value); if (r.ok) setThread(r.thread); else setMessage(r.message); });
  }, []);
  const send = () => start(async () => {
    const r = await submitGuestReplyAction(token, body);
    if (r.ok) { setThread(r.thread); setBody(''); setSent(true); setMessage(null); } else setMessage(r.message);
  });
  return <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-10">
    <h1 className="text-2xl font-bold">{thread?.brandName ? `Samtale med ${thread.brandName}` : 'Din samtale'}</h1>
    {!thread && pending && <p className="text-muted-foreground">Henter samtalen…</p>}
    {thread && <ol className="space-y-3" aria-label="Samtale">{thread.messages.map((m, i) => <li key={i} className={`rounded-lg border p-4 ${m.direction === 'guest' ? 'ml-6 bg-muted/40' : 'mr-6'}`}>
      <p className="mb-1 text-xs text-muted-foreground">{m.direction === 'guest' ? 'Dig' : thread.brandName} · {time(m.at)}</p>
      <p className="whitespace-pre-line break-words">{m.body}</p></li>)}</ol>}
    {thread && <div className="space-y-3">
      <label htmlFor="guest-reply" className="block text-sm font-medium">Dit svar</label>
      <textarea id="guest-reply" className="min-h-32 w-full rounded-md border bg-background p-3" maxLength={2000} value={body} disabled={pending} onChange={e => { setBody(e.target.value); setSent(false); }} />
      <button type="button" className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50" disabled={pending || !body.trim()} onClick={send}>Send svar</button>
      <p className="text-xs text-muted-foreground">Dit svar gemmes sammen med samtalen, så vi har det hele samlet. Linket er personligt – del det ikke.</p>
    </div>}
    {sent && <p role="status">Tak – dit svar er sendt.</p>}
    {message && <p role="alert">{message}</p>}
  </main>;
}
