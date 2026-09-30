'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerPickupPayment, cancelPickupOrder } from '@/app/merchant/orders/actions';
import { updateOrderStatus } from '@/app/superadmin/sales/orders/actions';
import { Button } from '@/components/ui/button';
import type { OrderStatus } from '@/types';
import type { RestaurantPaymentForm } from '@/lib/merchant-payment-methods';

export function OrderPaymentActions({ orderId, paymentMethod, paymentStatus, status, canEdit = true }: {
  orderId: string; paymentMethod?: string; paymentStatus: string; status: OrderStatus; canEdit?: boolean;
}) {
  const router = useRouter(), inFlight = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [method, setMethod] = useState<RestaurantPaymentForm>('cash');
  const pickupPending = paymentMethod === 'PayAtPickup' && paymentStatus === 'Pending' && !['Pending', 'Canceled'].includes(status);
  const canPrepare = status !== 'Canceled' && (paymentStatus === 'Paid' || pickupPending);
  async function run(action: () => Promise<{ success: boolean; message: string }>) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setMessage('');
    try { const result = await action(); setMessage(result.message); if (result.success) router.refresh(); }
    catch { setMessage('Resultatet kunne ikke bekræftes. Opdater ordren før du prøver igen.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (!canEdit) return null;
  return <div className="space-y-3">
    {pickupPending && <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2">Betalingsform<select aria-label="Betalingsform" value={method} disabled={busy} onChange={event => setMethod(event.target.value as RestaurantPaymentForm)} className="h-11 rounded-md border bg-background px-3">
        <option value="cash">Kontant</option><option value="card">Kort i restaurant</option>
      </select></label>
      <Button disabled={busy} onClick={() => void run(() => registerPickupPayment(orderId, method))}>Registrér betaling modtaget</Button>
      <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm('Annullér denne ubetalte ordre og frigiv rabatreservationen?')) void run(() => cancelPickupOrder(orderId)); }}>Annullér ubetalt ordre</Button>
    </div>}
    {canPrepare && <div className="flex flex-wrap gap-2">
      {status === 'Received' && <Button variant="outline" disabled={busy} onClick={() => void run(() => updateOrderStatus(orderId, 'In Progress'))}>Start klargøring</Button>}
      {status === 'In Progress' && <Button variant="outline" disabled={busy} onClick={() => void run(() => updateOrderStatus(orderId, 'Ready'))}>Klar til afhentning</Button>}
      {status === 'Ready' && paymentStatus === 'Paid' && <Button variant="outline" disabled={busy} onClick={() => void run(() => updateOrderStatus(orderId, 'Completed'))}>Afslut ordre</Button>}
    </div>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
