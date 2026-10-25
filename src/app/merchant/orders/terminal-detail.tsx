'use client';
import { useRef, useState, type ReactNode } from 'react';
import type { TerminalOrder } from '@/lib/orders/terminal-types';
import type { OrderStatus } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPrice } from '@/lib/storefront-format';
import { ORDER_STATUS_LABELS } from '@/lib/orders/presentation';
import { registerPickupPayment } from './actions';
import { terminalTime } from './terminal-board';

type Command = { orderId: string; brandId: string; locationId: string; expectedStatus: OrderStatus; status: OrderStatus; requestId: string };
export function TerminalDetail({ order, canEdit, disabled = false, onClose, onChanged, reprint, statusEndpoint = '/api/merchant/orders/status', paymentEndpoint }: {
  order: TerminalOrder; canEdit: boolean; disabled?: boolean; onClose: () => void; onChanged: () => void; reprint?: ReactNode; statusEndpoint?: string; paymentEndpoint?: string;
}) {
  const [busy, setBusy] = useState(false), lock = useRef(false), command = useRef<Command | null>(null);
  const [message, setMessage] = useState(''), [failure, setFailure] = useState(false);
  const [paymentConfirm, setPaymentConfirm] = useState(false), [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [uncertainPayment, setUncertainPayment] = useState(false);
  const next: OrderStatus | null = order.status === 'Received' ? 'In Progress' : order.status === 'In Progress' ? 'Ready' : order.status === 'Ready' ? (order.deliveryType === 'Delivery' ? 'Delivered' : 'Completed') : null;
  const unpaidCompletion = next !== null && ['Completed', 'Delivered'].includes(next) && order.paymentStatus !== 'Paid';
  async function advance() {
    if (lock.current || !next || disabled || unpaidCompletion || !canEdit) return;
    lock.current = true; setBusy(true); setMessage(''); setFailure(false);
    command.current ??= { orderId: order.id, brandId: order.brandId, locationId: order.locationId, expectedStatus: order.status, status: next, requestId: crypto.randomUUID() };
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(statusEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(command.current), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.success) {
        if (response.status < 500) command.current = null;
        setFailure(true); setMessage(typeof result.message === 'string' ? result.message : 'Ordren kunne ikke opdateres. Opdater overblikket og prøv igen.');
        onChanged(); return;
      }
      command.current = null; setMessage('Ordren er opdateret.'); onChanged();
    } catch { setFailure(true); setMessage('Resultatet er ikke bekræftet. Prøv samme handling igen, eller opdater overblikket.'); }
    finally { clearTimeout(timeout); lock.current = false; setBusy(false); }
  }
  async function terminalPayment(): Promise<{ success: boolean; message: string }> {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(paymentEndpoint!, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, method: paymentMethod }), signal: controller.signal });
      const result = await response.json();
      if (response.status >= 500) throw new Error('uncertain_payment');
      return { success: response.ok && result.success === true, message: typeof result.message === 'string' ? result.message : 'Betalingen kunne ikke registreres. Opdater og prøv igen.' };
    } finally { clearTimeout(timeout); }
  }
  async function collectPayment() {
    if (lock.current || disabled || !canEdit || uncertainPayment) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const result = paymentEndpoint ? await terminalPayment() : await registerPickupPayment(order.id, paymentMethod);
      setFailure(!result.success); setMessage(result.message);
      if (result.success) { setPaymentConfirm(false); onChanged(); } else if (paymentEndpoint) onChanged();
    } catch { setUncertainPayment(true); setFailure(true); setMessage('Betalingen kunne ikke bekræftes. Opdater ordren og kontrollér betalingsstatus før du fortsætter.'); onChanged(); }
    finally { lock.current = false; setBusy(false); }
  }
  const actionLabel = next === 'In Progress' ? 'Start tilberedning' : next === 'Ready' ? 'Markér klar' : next === 'Delivered' ? 'Markér leveret' : 'Markér afhentet';
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle className="break-all text-2xl">Ordre {order.id}</DialogTitle><DialogDescription>{order.brandName} · {order.locationName} · {ORDER_STATUS_LABELS[order.status]}</DialogDescription></DialogHeader>
    <div className="flex flex-wrap justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><p className="text-sm text-slate-600">{order.deliveryType === 'Delivery' ? 'Levering' : 'Afhentning'}</p><p className="text-3xl font-bold tabular-nums">{terminalTime(order)}</p>{order.fulfillmentAt && <p className="text-sm">{new Date(order.fulfillmentAt).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' })}</p>}</div><div className="text-right"><p className="font-semibold">{order.customerName || 'Kunde'}</p>{order.customerPhone && <a href={`tel:${order.customerPhone}`} className="block py-2 text-blue-700 underline">{order.customerPhone}</a>}<p className="text-sm">{order.deliveryAddress}</p></div></div>
    <ul className="divide-y">{order.items.map((item, index) => <li key={index} className="flex justify-between gap-4 py-3"><div className="min-w-0"><p className="break-words font-semibold">{item.quantity}× {item.name}</p>{item.modifiers.map((modifier, i) => <p className="mt-1 break-words text-sm text-slate-600" key={i}>+ {modifier}</p>)}</div><span className="shrink-0">{formatPrice(item.totalPrice)}</span></li>)}</ul>
    {order.notes && <div className="rounded-xl bg-amber-50 p-4"><p className="font-semibold">Bemærkning til ordren</p><p className="whitespace-pre-wrap break-words">{order.notes}</p></div>}
    <div className="flex flex-wrap justify-between gap-2 border-t pt-4"><strong>I alt {formatPrice(order.totalAmount)}</strong><span className={order.paymentStatus === 'Paid' ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-900'}>{order.paymentStatus === 'Paid' ? 'Betalt' : 'Betaling mangler'}</span></div>
    {canEdit && order.paymentMethod === 'PayAtPickup' && order.paymentStatus === 'Pending' && ['Received', 'In Progress', 'Ready'].includes(order.status) && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="font-semibold">Modtag {formatPrice(order.totalAmount)} ved afhentning</p>
      {!paymentConfirm ? <button className="mt-3 min-h-12 rounded-lg border bg-white px-4 font-semibold" disabled={busy || disabled || uncertainPayment} onClick={() => setPaymentConfirm(true)}>Registrér betaling</button> : <div className="mt-3 space-y-3"><label className="block">Betalingsform<select className="ml-2 min-h-12 rounded-lg border bg-white px-3" aria-label="Betalingsform" value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as 'cash' | 'card')} disabled={busy}><option value="cash">Kontant</option><option value="card">Kort i restaurant</option></select></label><p>Bekræft kun, når du har modtaget beløbet.</p><div className="flex flex-wrap gap-2"><button className="min-h-12 rounded-lg bg-slate-900 px-4 font-semibold text-white" disabled={busy || disabled || uncertainPayment} onClick={() => void collectPayment()}>Bekræft betaling modtaget</button><button className="min-h-12 rounded-lg border bg-white px-4" disabled={busy} onClick={() => setPaymentConfirm(false)}>Fortryd</button></div></div>}
    </section>}
    {message && <p role={failure ? 'alert' : 'status'} className={`rounded-lg p-3 ${failure ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}>{message}</p>}
    {disabled && <p className="text-sm text-amber-900">Opdater forbindelsen, før du ændrer ordren.</p>}
    {canEdit && next && <div className="space-y-2"><button className="min-h-14 w-full rounded-xl bg-slate-900 px-6 py-4 text-lg font-semibold text-white disabled:opacity-50" disabled={busy || disabled || unpaidCompletion} onClick={() => void advance()}>{busy ? 'Gemmer…' : actionLabel}</button>{unpaidCompletion && <p className="text-sm text-amber-900">Registrér betalingen, før ordren markeres afhentet eller leveret.</p>}</div>}
    {!canEdit && <p className="text-sm text-slate-600">Du har læseadgang. En medarbejder med ordreadgang kan ændre status.</p>}
    {reprint}
  </DialogContent></Dialog>;
}
