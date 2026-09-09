'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { sendFeedbackRequestEmail } from '@/app/superadmin/feedback/actions';
export function FeedbackRequestButton({ orderId }: { orderId: string }) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState('');
  return <div className="max-w-sm space-y-2"><Button variant="outline" disabled={pending} onClick={async () => {
    if (pending) return; setPending(true); setMessage('');
    try { const result = await sendFeedbackRequestEmail(orderId); setMessage(result.error || result.message || ''); }
    catch { setMessage('Kunne ikke kontakte serveren. Prøv igen.'); }
    finally { setPending(false); }
  }}>{pending ? 'Registrerer…' : 'Send feedbackanmodning'}</Button>{message && <p role="status" className="text-sm">{message}</p>}</div>;
}
