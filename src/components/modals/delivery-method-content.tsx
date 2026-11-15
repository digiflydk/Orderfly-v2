'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Truck, Store, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cart-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OrderModal } from '@/components/storefront/OrderModal';
import { DeliveryMethodLabel } from '@/components/storefront/DeliveryMethodLabel';
import type { DeliveryModalPayload } from '@/lib/delivery-modal-state';
import { browserOrderEntryUrl } from '@/hooks/use-storefront-path';
// Esmeralda gets the landing "Bestil nu" bottom sheet; its copy and styling are brand-specific, so other brands keep the generic dialog.
const ORDER_SHEET_BRANDS = new Set(['esmeralda']);
export default function DeliveryMethodContent({ payload, onClose }: { payload: DeliveryModalPayload; onClose: () => void }) {
  const {location, setDeliveryType} = useCart();
  const router = useRouter();
  const activeLocation = payload?.location || location;
  // The menu is rendered on the server before it is shown, so the sheet stays open with a loading state
  // until the menu has arrived; otherwise nothing seems to happen for a moment and customers tap again.
  const [chosen, setChosen] = useState<'pickup' | 'delivery' | null>(null);
  const [navigating, startNavigation] = useTransition();
  const started = useRef(false);
  // Read synchronously: the sheet asks to close in the same click that chose the method.
  const chosenRef = useRef<'pickup' | 'delivery' | null>(null);
  useEffect(() => { if (started.current && !navigating) onClose(); }, [navigating, onClose]);
  // Back from the brand subdomain can restore this page from the back/forward cache with the sheet still loading.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => { if (event.persisted && chosenRef.current) onClose(); };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, [onClose]);
  function choose(mode: 'pickup' | 'delivery') {
    if (!payload || chosenRef.current || !activeLocation?.deliveryTypes.includes(mode)) return;
    setDeliveryType(mode);
    chosenRef.current = mode;
    setChosen(mode);
    const target = `${browserOrderEntryUrl(payload.brandSlug, payload.locationSlug)}?deliveryMethod=${mode}`;
    // From orderfly.dk the order continues on the brand subdomain, a full page load; the sheet stays until it unloads.
    if (/^https?:/.test(target)) { window.location.assign(target); return; }
    started.current = true;
    startNavigation(() => router.push(target));
  }
  const close = (value: boolean) => {if (!value && !chosenRef.current) onClose();};
  if (payload && ORDER_SHEET_BRANDS.has(payload.brandSlug)) {
    return <OrderModal open onOpenChange={close} modes={activeLocation?.deliveryTypes ?? []} location={activeLocation ?? undefined} preferredMode="pickup"
      loading={chosen === 'delivery' ? 'delivery' : chosen === 'pickup' ? 'takeaway' : undefined}
      onDeliveryMethodSelected={method => choose(method === 'delivery' ? 'delivery' : 'pickup')} />;
  }
  return <Dialog open={!!payload} onOpenChange={close}>
    <DialogContent data-commerce-panel="delivery"><DialogHeader><DialogTitle>Afhentning eller levering</DialogTitle>
      <DialogDescription>{chosen ? 'Henter menuen…' : 'Vælg afhentning eller levering. Du kan ændre det senere.'}</DialogDescription></DialogHeader>
      <Button className="h-auto min-h-11 flex-wrap gap-2 py-3" disabled={!!chosen || !activeLocation?.deliveryTypes.includes('pickup')} aria-busy={chosen === 'pickup' || undefined} onClick={() => choose('pickup')}>{chosen === 'pickup' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Store className="mr-2 h-4 w-4" />}Afhentning <DeliveryMethodLabel location={activeLocation} mode="pickup" /></Button>
      <Button className="h-auto min-h-11 flex-wrap gap-2 py-3" disabled={!!chosen || !activeLocation?.deliveryTypes.includes('delivery')} aria-busy={chosen === 'delivery' || undefined} onClick={() => choose('delivery')}>{chosen === 'delivery' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Truck className="mr-2 h-4 w-4" />}Levering <DeliveryMethodLabel location={activeLocation} mode="delivery" /></Button>
    </DialogContent>
  </Dialog>;
}
