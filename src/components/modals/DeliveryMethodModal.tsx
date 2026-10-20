'use client';
import { useEffect, useState } from 'react';
import { Truck, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cart-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OrderModal } from '@/components/storefront/OrderModal';
import type { Location } from '@/types';
import { browserStorefrontPath } from '@/hooks/use-storefront-path';
type Payload = {brandSlug: string; locationSlug: string; location?: Location};
let open: ((payload: Payload) => void) | null = null;
export function openDeliveryModal(payload: Payload) { open?.(payload); }
// Esmeralda gets the landing "Bestil nu" bottom sheet; its copy and styling are brand-specific, so other brands keep the generic dialog.
const ORDER_SHEET_BRANDS = new Set(['esmeralda']);
export default function DeliveryMethodModal() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const {location, setDeliveryType} = useCart();
  const router = useRouter();
  useEffect(() => {open = setPayload; return () => {open = null;};}, []);
  const activeLocation = payload?.location || location;
  function choose(mode: 'pickup' | 'delivery') {
    if (!payload || !activeLocation?.deliveryTypes.includes(mode)) return;
    setDeliveryType(mode);
    router.push(`${browserStorefrontPath(payload.brandSlug, payload.locationSlug)}?deliveryMethod=${mode}`);
    setPayload(null);
  }
  const close = (value: boolean) => {if (!value) setPayload(null);};
  if (payload && ORDER_SHEET_BRANDS.has(payload.brandSlug)) {
    return <OrderModal open onOpenChange={close} modes={activeLocation?.deliveryTypes ?? []}
      onDeliveryMethodSelected={method => choose(method === 'delivery' ? 'delivery' : 'pickup')} />;
  }
  return <Dialog open={!!payload} onOpenChange={close}>
    <DialogContent data-commerce-panel="delivery"><DialogHeader><DialogTitle>Afhentning eller levering</DialogTitle>
      <DialogDescription>Vælg afhentning eller levering. Du kan ændre det senere.</DialogDescription></DialogHeader>
      <Button disabled={!activeLocation?.deliveryTypes.includes('pickup')} onClick={() => choose('pickup')}><Store className="mr-2 h-4 w-4" />Afhentning</Button>
      <Button disabled={!activeLocation?.deliveryTypes.includes('delivery')} onClick={() => choose('delivery')}><Truck className="mr-2 h-4 w-4" />Levering</Button>
    </DialogContent>
  </Dialog>;
}
