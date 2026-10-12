'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerPickupPayment, cancelPickupOrder } from '@/app/merchant/orders/actions';
import { updateOrderStatus } from '@/app/superadmin/sales/orders/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { OrderStatus } from '@/types';
import type { RestaurantPaymentForm } from '@/lib/merchant-payment-methods';

export function OrderPaymentActions({ orderId, paymentMethod, paymentStatus, status, canEdit = true }: {
  orderId: string; paymentMethod?: string; paymentStatus: string; status: OrderStatus; canEdit?: boolean;
}) {
  const router = useRouter(), inFlight = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [method, setMethod] = useState<RestaurantPaymentForm>('cash');
  const [cancelMode, setCancelMode] = useState<'paid' | 'pickup' | null>(null), [cancellationComment, setCancellationComment] = useState('');
  const pickupPending = paymentMethod === 'PayAtPickup' && paymentStatus === 'Pending' && !['Pending', 'Canceled'].includes(status);
  const canPrepare = status !== 'Canceled' && (paymentStatus === 'Paid' || pickupPending);
  async function run(action: () => Promise<{ success: boolean; message: string }>) {
    if (inFlight.current) return false; inFlight.current = true; setBusy(true); setMessage('');
    try { const result = await action(); setMessage(result.message); if (result.success) router.refresh(); return result.success; }
    catch { setMessage('Resultatet kunne ikke bekræftes. Opdater ordren før du prøver igen.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function submitCancellation() {
    if (!cancelMode || cancellationComment.trim().length < 3 || cancellationComment.trim().length > 500) return;
    const succeeded = await run(() => cancelMode === 'pickup'
      ? cancelPickupOrder(orderId, cancellationComment.trim())
      : updateOrderStatus(orderId, 'Canceled', cancellationComment.trim()));
    if (succeeded) { setCancelMode(null); setCancellationComment(''); }
  }
  if (!canEdit) return null;
  return <div className="space-y-3">
    {pickupPending && <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">Betalingsform<select aria-label="Betalingsform" value={method} disabled={busy} onChange={event => setMethod(event.target.value as RestaurantPaymentForm)} className="h-11 rounded-md border bg-background px-3">
        <option value="cash">Kontant</option><option value="card">Kort i restaurant</option>
      </select></label>
      <Button disabled={busy} onClick={() => void run(() => registerPickupPayment(orderId, method))}>Registrér betaling modtaget</Button>
      <Button variant="outline" disabled={busy} onClick={() => setCancelMode('pickup')}>Annullér ubetalt ordre</Button>
    </div>}
    {paymentStatus === 'Paid' && status !== 'Canceled' && <Button variant="destructive" disabled={busy} onClick={() => setCancelMode('paid')}>Annullér betalt ordre</Button>}
    <Dialog open={cancelMode !== null} onOpenChange={open => { if (!open && !busy) { setCancelMode(null); setCancellationComment(''); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annullér ordre</DialogTitle>
          <DialogDescription>{cancelMode === 'paid' ? 'Ordren bliver udeladt fra omsætningen. Refundering skal håndteres separat.' : 'Ordren annulleres, og rabatreservationen frigives. Skriv hvorfor ordren annulleres.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancellation-comment">Kommentar (påkrævet)</Label>
          <Textarea id="cancellation-comment" value={cancellationComment} maxLength={500} disabled={busy} onChange={event => setCancellationComment(event.target.value)} placeholder="Beskriv årsagen til annulleringen" />
          <p className="text-xs text-muted-foreground">3–500 tegn · {cancellationComment.trim().length}/500</p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setCancelMode(null)}>Fortryd</Button>
          <Button variant="destructive" disabled={busy || cancellationComment.trim().length < 3 || cancellationComment.trim().length > 500} onClick={() => void submitCancellation()}>{busy ? 'Gemmer…' : 'Bekræft annullering'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {canPrepare && <div className="flex flex-wrap gap-2">
      {status === 'Received' && <Button variant="outline" disabled={busy} onClick={() => void run(() => updateOrderStatus(orderId, 'In Progress'))}>Start klargøring</Button>}
      {status === 'In Progress' && <Button variant="outline" disabled={busy} onClick={() => void run(() => updateOrderStatus(orderId, 'Ready'))}>Klar til afhentning</Button>}
      {status === 'Ready' && paymentStatus === 'Paid' && <Button variant="outline" disabled={busy} onClick={() => void run(() => updateOrderStatus(orderId, 'Completed'))}>Afslut ordre</Button>}
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
