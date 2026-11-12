'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadWorldlineOrderPayment, worldlineOrderOperation } from '@/app/superadmin/payments/worldline-operations-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Snapshot = NonNullable<Awaited<ReturnType<typeof loadWorldlineOrderPayment>>>;
type Pending = { requestId: string; operation: 'credit'; amountMinor: number } | { requestId: string; operation: 'delete' };
const money = (minor: number) => new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(minor / 100);
const storageKey = (id: string) => `orderfly:worldline-operation:${id}`;
function storedRequest(id: string): Pending | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(id)) || 'null');
    if (!value || typeof value.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId)) return null;
    if (value.operation === 'delete') return { requestId: value.requestId, operation: 'delete' };
    if (value.operation === 'credit' && Number.isSafeInteger(value.amountMinor) && value.amountMinor > 0) return { requestId: value.requestId, operation: 'credit', amountMinor: value.amountMinor };
  } catch { /* The server journal remains authoritative when browser storage is unavailable. */ }
  return null;
}
function remember(id: string, request: Pending | null) {
  try { if (request) sessionStorage.setItem(storageKey(id), JSON.stringify(request)); else sessionStorage.removeItem(storageKey(id)); } catch { /* Do not discard an in-memory request or duplicate a provider call. */ }
}
function amountMinor(text: string): number | null {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** The browser holds operation identity only. Provider credentials and stored secret references stay server-side. */
export function WorldlineOrderPayment({ orderId, canEdit }: { orderId: string; canEdit: boolean }) {
  const router = useRouter(), inFlight = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [amount, setAmount] = useState(''), [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null), [confirm, setConfirm] = useState<'credit' | 'delete' | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setSnapshot(null); setConfirm(null);
    const saved = storedRequest(orderId); setPending(saved);
    loadWorldlineOrderPayment(orderId).then(value => {
      if (!active) return;
      setSnapshot(value);
      if (!value) return;
      setAmount((value.remainingMinor / 100).toFixed(2).replace('.', ','));
      if (value.pending) {
        const operation = value.pending;
        const recover: Pending | null = operation.operation === 'delete' ? { requestId: operation.requestId, operation: 'delete' }
          : operation.amountMinor ? { requestId: operation.requestId, operation: 'credit', amountMinor: operation.amountMinor } : null;
        setPending(recover); remember(orderId, recover);
      }
    }).catch(() => { if (active) setMessage('Betalingsstatus kunne ikke hentes. Ingen betalingshandling er udført.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId, refresh]);
  const refund = amountMinor(amount);
  async function perform(request: Pending) {
    if (!canEdit || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage(''); setConfirm(null); setPending(request); remember(orderId, request);
    try {
      const result = await worldlineOrderOperation({ orderId, ...request });
      if (result.state === 'confirmed') {
        setMessage(request.operation === 'credit' ? 'Refunderingen er bekræftet.' : 'Reservationen er annulleret.');
        setPending(null); remember(orderId, null); setRefresh(value => value + 1); router.refresh();
      } else if (result.state === 'rejected') {
        setMessage('message' in result && typeof result.message === 'string' ? result.message : 'Worldline afviste handlingen. Kontrollér oplysningerne, før du opretter en ny anmodning.');
        setPending(null); remember(orderId, null); setRefresh(value => value + 1);
      } else setMessage('Resultatet er endnu ukendt. Kontrollér samme anmodning; opret ikke en ny refundering eller annullering.');
    } catch {
      setMessage('Resultatet kunne ikke bekræftes. Samme anmodning er bevaret, så du kan kontrollere resultatet uden en ny pengeoperation.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  function confirmOperation() {
    if (!confirm || !snapshot) return;
    if (confirm === 'credit' && (!snapshot.canRefund || refund === null || refund > snapshot.remainingMinor)) return;
    if (confirm === 'delete' && !snapshot.canVoid) return;
    const request: Pending = confirm === 'delete' ? { requestId: crypto.randomUUID(), operation: 'delete' }
      : { requestId: crypto.randomUUID(), operation: 'credit', amountMinor: refund! };
    void perform(request);
  }
  if (loading) return <p role="status">Henter Worldline-betalingsstatus…</p>;
  if (!snapshot) return message ? <p role="status">{message}</p> : null;
  return <section aria-label="Worldline betalingshandlinger" className="space-y-4 rounded-md border p-4">
    <h3 className="font-semibold">Worldline</h3>
    <p className="text-sm">{snapshot.environment === 'test' ? 'Test' : 'Live'} · {snapshot.agreement === 'brand' ? 'Brandets hovedaftale' : 'Lokationens egen aftale'} · Merchant {snapshot.merchantNumber}</p>
    <dl className="grid gap-2 text-sm sm:grid-cols-3">
      <div><dt>Ordrebeløb</dt><dd>{money(snapshot.amountMinor)}</dd></div>
      <div><dt>Refunderet</dt><dd>{money(snapshot.refundedMinor)}</dd></div>
      <div><dt>Resterende beløb</dt><dd>{money(snapshot.remainingMinor)}</dd></div>
    </dl>
    {snapshot.paymentStatus === 'Pending' && !snapshot.voided && <p className="text-sm">Afventer bekræftet hævning. En godkendelse i betalingsvinduet er ikke en kvittering for hævning.</p>}
    {snapshot.voided && <p className="text-sm">Betalingsreservationen er annulleret.</p>}
    {snapshot.managedDelivery && <p className="text-sm">Betalingsændringer for administreret levering håndteres gennem leveringsflowet.</p>}
    {snapshot.locked && !pending && <p role="status">En betalingsoperation afventer afstemning. Nye pengeoperationer er låst.</p>}
    {canEdit && pending && <div className="space-y-2">
      <p role="status">Afventer resultat: {pending.operation === 'credit' ? `refundering på ${money(pending.amountMinor)}` : 'annullering af reservation'}. Samme anmodning bruges ved kontrol.</p>
      <Button variant="outline" disabled={busy} onClick={() => void perform(pending)}>{busy ? 'Kontrollerer…' : 'Kontrollér resultat'}</Button>
    </div>}
    {canEdit && !pending && <div className="space-y-3">
      {snapshot.canRefund && <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">Refundér beløb i DKK<Input aria-label="Refunderingsbeløb i DKK" inputMode="decimal" value={amount} disabled={busy} maxLength={16} onChange={event => setAmount(event.target.value)} /></label>
        <Button variant="outline" disabled={busy || refund === null || refund > snapshot.remainingMinor} onClick={() => setConfirm('credit')}>Refundér beløb</Button>
      </div>}
      {snapshot.canVoid && <Button variant="outline" disabled={busy} onClick={() => setConfirm('delete')}>Annullér betalingsreservation</Button>}
    </div>}
    <Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Genindlæs betalingsstatus</Button>
    <Dialog open={confirm !== null} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirm === 'credit' ? 'Bekræft refundering' : 'Bekræft annullering af reservation'}</DialogTitle>
          <DialogDescription>{confirm === 'credit' ? `${refund !== null ? money(refund) : ''} tilbageføres til kundens oprindelige Worldline-betaling. Handlingen kan ikke fortrydes.` : 'Den uhævede betalingsreservation annulleres hos Worldline. Ordren annulleres, når resultatet er bekræftet.'}</DialogDescription>
        </DialogHeader>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Fortryd</Button><Button disabled={busy} onClick={confirmOperation}>Bekræft handling</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
