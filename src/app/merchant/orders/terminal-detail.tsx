'use client';
import { useKdsLanguage } from './kds-language';
import { Bike, ChevronDown, ShoppingBag, Store } from 'lucide-react';
import { kitchenDeadline } from '@/lib/orders/kitchen-clock';
import { KitchenClock } from './kitchen-clock';
import { ManagedDeliveryTracking } from '@/components/checkout/managed-delivery-tracking';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TerminalOrder } from '@/lib/orders/terminal-types';
import type { OrderStatus } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPrice } from '@/lib/storefront-format';
import { ORDER_STATUS_LABELS } from '@/lib/orders/presentation';
import { registerPickupPayment } from './actions';
import { terminalTime } from './terminal-board';

type Command = { orderId: string; brandId: string; locationId: string; expectedStatus: OrderStatus; status: OrderStatus; requestId: string };
export function TerminalDetail({ order, canEdit, disabled = false, onClose, onChanged, reprint, statusEndpoint = '/api/merchant/orders/status', paymentEndpoint, refreshRevision = 0, warningMinutes = 5, overdueMinutes = 5, inline = false, mobileCard = false, now = Date.now(), readyTimeEndpoint = '/api/merchant/orders/ready-time' }: {
  warningMinutes?: number; overdueMinutes?: number; refreshRevision?: number; inline?: boolean; mobileCard?: boolean; now?: number; readyTimeEndpoint?: string; order: TerminalOrder; canEdit: boolean; disabled?: boolean; onClose: () => void; onChanged: () => void; reprint?: ReactNode; statusEndpoint?: string; paymentEndpoint?: string;
}) {
  const {t, language} = useKdsLanguage();
  const [busy, setBusy] = useState(false), lock = useRef(false), command = useRef<Command | null>(null);
  const [expanded, setExpanded] = useState(mobileCard && order.status !== 'Ready');
  const deadline = kitchenDeadline(order), remaining = deadline ? Date.parse(deadline) - now : null;
  const attention = remaining !== null && ['Received','In Progress'].includes(order.status) ? remaining <= -overdueMinutes * 60_000 ? 'animate-pulse bg-red-600 text-white' : remaining <= warningMinutes * 60_000 ? 'animate-pulse bg-yellow-300 text-slate-950' : 'bg-slate-900 text-white' : 'bg-slate-900 text-white';
  const [message, setMessage] = useState(''), [failure, setFailure] = useState(false);
  const [paymentConfirm, setPaymentConfirm] = useState(false), [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [uncertainPayment, setUncertainPayment] = useState(false);
  const [reconcilingPayment, setReconcilingPayment] = useState(false);
  const reconcileAfter = useRef(0);
  useEffect(() => {
    if (!reconcilingPayment || !uncertainPayment || disabled || !canEdit || refreshRevision <= reconcileAfter.current) return;
    setReconcilingPayment(false); setUncertainPayment(false); setPaymentConfirm(false); setFailure(false);
    setMessage(order.paymentStatus === 'Paid' ? t("Betalingen er registreret.") : t("Frisk status: betalingen er endnu ikke registreret. Bekræft kun igen, hvis beløbet er modtaget."));
  }, [refreshRevision, reconcilingPayment, uncertainPayment, disabled, canEdit, order.paymentStatus]);
  const next: OrderStatus | null = order.status === 'Received' ? 'In Progress' : order.status === 'In Progress' ? 'Ready' : order.status === 'Ready' ? (order.deliveryType === 'Delivery' ? (order.managedDelivery?null:'Delivered') : 'Completed') : null;
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
        setFailure(true); setMessage(typeof result.message === 'string' ? result.message : t("Ordren kunne ikke opdateres. Opdater overblikket og prøv igen."));
        onChanged(); return;
      }
      command.current = null; setMessage(t("Ordren er opdateret.")); onChanged();
    } catch { setFailure(true); setMessage(t("Resultatet er ikke bekræftet. Prøv samme handling igen, eller opdater overblikket.")); }
    finally { clearTimeout(timeout); lock.current = false; setBusy(false); }
  }
  async function terminalPayment(): Promise<{ success: boolean; message: string }> {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(paymentEndpoint!, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, method: paymentMethod }), signal: controller.signal });
      const result = await response.json();
      if (response.status >= 500) throw new Error('uncertain_payment');
      return { success: response.ok && result.success === true, message: typeof result.message === 'string' ? result.message : t("Betalingen kunne ikke registreres. Opdater og prøv igen.") };
    } finally { clearTimeout(timeout); }
  }
  async function collectPayment() {
    if (lock.current || disabled || !canEdit || uncertainPayment) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const result = paymentEndpoint ? await terminalPayment() : await registerPickupPayment(order.id, paymentMethod);
      setFailure(!result.success); setMessage(result.message);
      if (result.success) { setPaymentConfirm(false); onChanged(); } else if (paymentEndpoint) onChanged();
    } catch { setUncertainPayment(true); setFailure(true); setMessage(t("Betalingen kunne ikke bekræftes. Opdater ordren og kontrollér betalingsstatus før du fortsætter.")); onChanged(); }
    finally { lock.current = false; setBusy(false); }
  }
  const actionLabel = next === 'In Progress' ? t("Start tilberedning") : next === 'Ready' ? t("Markér klar") : next === 'Delivered' ? t("Markér leveret") : t("Markér afhentet");
  const content = <>
    {inline ? mobileCard ? <header className="space-y-4">
      <div className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-white"><Store aria-hidden="true" className="h-5 w-5" /></span>
        <span className="truncate text-sm font-bold text-slate-900">{order.brandName || order.locationName}</span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="rounded-lg bg-slate-100 px-3 py-2 text-xl font-bold">#{order.id.replace(/^ORD[-\\s]*/i, '')}</strong>
            <span className="min-w-0 break-words text-lg font-bold">{order.customerName || t("Kunde")}</span>
          </div>
          <span className="inline-flex max-w-full items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold">
            {order.deliveryType === 'Delivery' ? <Bike className="h-5 w-5 shrink-0" aria-hidden="true" /> : <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden="true" />}
            {order.deliveryType === 'Delivery' ? order.managedDelivery ? t('Kurérlevering') : t('Levering') : t('Afhentning')}
          </span>
          <p className="text-sm text-slate-600">{t(ORDER_STATUS_LABELS[order.status])}</p>
        </div>
        <KitchenClock compact order={order} now={now} canEdit={canEdit} disabled={disabled}
          endpoint={readyTimeEndpoint} onChanged={onChanged} />
      </div>
    </header> : <header><h3 className="break-all text-xl font-bold">{' '}{t("Ordre")}{' '}{order.id}</h3><p className="text-sm text-slate-600">{t(ORDER_STATUS_LABELS[order.status])}</p></header> : <DialogHeader><DialogTitle className="break-all text-2xl">{' '}{t("Ordre")}{' '}{order.id}</DialogTitle><DialogDescription>{order.brandName} · {order.locationName} · {t(ORDER_STATUS_LABELS[order.status])}</DialogDescription></DialogHeader>}
    {inline && !mobileCard && canEdit && next && <div className="space-y-2"><button className={`min-h-16 w-full rounded-xl px-6 py-4 text-lg font-semibold disabled:opacity-50 ${attention}`} disabled={busy || disabled || unpaidCompletion} onClick={() => void advance()}>{busy ? t("Gemmer…") : actionLabel}</button>{unpaidCompletion && <p className="text-sm text-amber-900">{' '}{t("Registrér betalingen, før ordren markeres afhentet eller leveret.")}{' '}</p>}</div>}
    {inline && !mobileCard && <KitchenClock alertClass={remaining !== null && remaining <= warningMinutes * 60_000 && ['Received','In Progress'].includes(order.status) ? attention : undefined} order={order} now={now} canEdit={canEdit} disabled={disabled} endpoint={readyTimeEndpoint} onChanged={onChanged} />}
    {inline && (mobileCard ? <button aria-expanded={expanded} className="flex min-h-14 w-full items-center justify-between gap-2 border-t pt-4 text-left" onClick={() => setExpanded(value => !value)}>
      <span className="text-base font-semibold">{formatPrice(order.totalAmount)} · {order.items.reduce((total, item) => total + item.quantity, 0)} {t('varer')}</span>
      <ChevronDown aria-hidden="true" className={`h-6 w-6 shrink-0 rounded-full bg-slate-100 p-1 transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button> : <button aria-expanded={expanded} className="min-h-12 w-full rounded-lg border px-4 text-left font-semibold" onClick={() => setExpanded(value => !value)}>{expanded ? t("Skjul ordredetaljer") : t("Vis ordredetaljer")}</button>)}
    {(!inline || expanded) && <>
    {inline ? <div className="text-sm"><p className="font-semibold">{order.customerName || t("Kunde")} · {order.deliveryType === 'Delivery' ? t("Levering") : t("Afhentning")}</p>{order.deliveryAddress && <p className="break-words">{order.deliveryAddress}</p>}{order.customerPhone && <a className="inline-block min-h-8 py-1 text-blue-700 underline" href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>}</div> : <div className="flex flex-wrap justify-between gap-3 rounded-xl bg-slate-50 p-4"><div><p className="text-sm text-slate-600">{order.deliveryType === 'Delivery' ? t("Levering") : t("Afhentning")}</p><p className="text-3xl font-bold tabular-nums">{terminalTime(order)}</p>{order.fulfillmentAt && <p className="text-sm">{new Date(order.fulfillmentAt).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen' })}</p>}</div><div className="text-right"><p className="font-semibold">{order.customerName || t("Kunde")}</p>{order.customerPhone && <a href={`tel:${order.customerPhone}`} className="block py-2 text-blue-700 underline">{order.customerPhone}</a>}<p className="text-sm">{order.deliveryAddress}</p></div></div>}
    {order.managedDelivery&&<ManagedDeliveryTracking enabled orderId={order.id} data={order.managedDeliveryTracking||null} variant="merchant" onRefresh={onChanged}/>}
    {order.managedDelivery&&order.status==='Ready'&&<p className="rounded border p-3">{' '}{t("Ordren er klar i køkkenet. Afhentning og levering opdateres fra kuréren.")}{' '}</p>}
    <ul className="divide-y">{order.items.map((item, index) => <li key={index} className="flex justify-between gap-4 py-3"><div className="min-w-0"><p className="break-words font-semibold">{item.quantity}× {item.name}</p>{item.modifiers.map((modifier, i) => <p className="mt-1 break-words text-sm text-slate-600" key={i}>{modifier}</p>)}</div><span className="shrink-0">{formatPrice(item.totalPrice)}</span></li>)}</ul>
    {order.notes && <div className="rounded-xl bg-amber-50 p-4"><p className="font-semibold">{' '}{t("Bemærkning til ordren")}{' '}</p><p className="whitespace-pre-wrap break-words">{order.notes}</p></div>}
    <div className="flex flex-wrap justify-between gap-2 border-t pt-4"><strong>{' '}{t("I alt")}{' '}{formatPrice(order.totalAmount)}</strong><span className={order.paymentStatus === 'Paid' ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-900'}>{order.paymentStatus === 'Paid' ? t("Betalt") : t("Betaling mangler")}</span></div>
    </>}
    {canEdit && order.paymentMethod === 'PayAtPickup' && order.paymentStatus === 'Pending' && ['Received', 'In Progress', 'Ready'].includes(order.status) && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="font-semibold">{' '}{t("Modtag")}{' '}{formatPrice(order.totalAmount)} ved afhentning</p>
      {!paymentConfirm ? <button className="mt-3 min-h-12 rounded-lg border bg-white px-4 font-semibold" disabled={busy || disabled || uncertainPayment} onClick={() => setPaymentConfirm(true)}>{' '}{t("Registrér betaling")}{' '}</button> : <div className="mt-3 space-y-3"><label className="block">{' '}{t("Betalingsform")}{' '}<select className="ml-2 min-h-12 rounded-lg border bg-white px-3" aria-label={t("Betalingsform")} value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as 'cash' | 'card')} disabled={busy}><option value="cash">{' '}{t("Kontant")}{' '}</option><option value="card">{' '}{t("Kort i restaurant")}{' '}</option></select></label><p>{' '}{t("Bekræft kun, når du har modtaget beløbet.")}{' '}</p><div className="flex flex-wrap gap-2"><button className="min-h-12 rounded-lg bg-slate-900 px-4 font-semibold text-white" disabled={busy || disabled || uncertainPayment} onClick={() => void collectPayment()}>{' '}{t("Bekræft betaling modtaget")}{' '}</button><button className="min-h-12 rounded-lg border bg-white px-4" disabled={busy} onClick={() => setPaymentConfirm(false)}>{' '}{t("Fortryd")}{' '}</button></div></div>}
    </section>}
    {uncertainPayment && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="text-sm">{' '}{t("Kontrollér frisk betalingsstatus, før du prøver igen.")}{' '}</p><button className="mt-2 min-h-14 w-full rounded-lg border bg-white p-3 font-semibold" disabled={busy || !canEdit} onClick={() => { reconcileAfter.current = refreshRevision; setReconcilingPayment(true); onChanged(); }}>{reconcilingPayment ? t("Hent betalingsstatus igen") : t("Kontrollér betalingsstatus")}</button></div>}
    {message && <p role={failure ? 'alert' : 'status'} className={`rounded-lg p-3 ${failure ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}>{t(message)}</p>}
    {disabled && <p className="text-sm text-amber-900">{' '}{t("Opdater forbindelsen, før du ændrer ordren.")}{' '}</p>}
    {!inline && canEdit && next && <div className="space-y-2"><button className={`min-h-16 w-full rounded-xl px-6 py-4 text-lg font-semibold disabled:opacity-50 ${attention}`} disabled={busy || disabled || unpaidCompletion} onClick={() => void advance()}>{busy ? t("Gemmer…") : actionLabel}</button>{unpaidCompletion && <p className="text-sm text-amber-900">{' '}{t("Registrér betalingen, før ordren markeres afhentet eller leveret.")}{' '}</p>}</div>}
    {!canEdit && <p className="text-sm text-slate-600">{' '}{t("Du har læseadgang. En medarbejder med ordreadgang kan ændre status.")}{' '}</p>}
    {inline && mobileCard && canEdit && next && <div className="space-y-2">
      <button className={`min-h-16 w-full rounded-xl px-6 py-4 text-lg font-bold disabled:opacity-50 ${attention}`}
        disabled={busy || disabled || unpaidCompletion} onClick={() => void advance()}>{busy ? t("Gemmer…") : actionLabel}</button>
      {unpaidCompletion && <p className="text-sm text-amber-900">{' '}{t("Registrér betalingen, før ordren markeres afhentet eller leveret.")}{' '}</p>}
    </div>}
    {reprint}
  </>;
  if (inline) return <article aria-label={`${t("Ordre")} ${order.id}`} className={mobileCard ? "min-w-0 space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" : "min-w-0 space-y-3 rounded-xl border bg-white p-4 shadow-sm"}>{content}</article>;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>{content}</DialogContent></Dialog>;
}
