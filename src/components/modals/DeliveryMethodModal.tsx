'use client';
import { useEffect, useRef, useState } from 'react';
import { Truck, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cart-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Location } from '@/types';
type Payload = {brandSlug: string; locationSlug: string; location?: Location};
let open: ((payload: Payload) => void) | null = null;
export function openDeliveryModal(payload: Payload) { open?.(payload); }
export default function DeliveryMethodModal() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const {location, setDeliveryType} = useCart();
  const router = useRouter();
  useEffect(() => {open = setPayload; return () => {open = null;};}, []);
  const activeLocation = payload?.location || location;
  function choose(mode: 'pickup' | 'delivery') {
    if (!payload || !activeLocation?.deliveryTypes.includes(mode)) return;
    setDeliveryType(mode);
    router.push(`/${payload.brandSlug}/${payload.locationSlug}?deliveryMethod=${mode}`);
    setPayload(null);
  }
  return <Dialog open={!!payload} onOpenChange={value => {if (!value) setPayload(null);}}>
    <DialogContent data-commerce-panel="delivery"><DialogHeader><DialogTitle>Delivery method</DialogTitle>
      <DialogDescription>Choose pick-up or delivery. You can change this later.</DialogDescription></DialogHeader>
      <Button disabled={!activeLocation?.deliveryTypes.includes('pickup')} onClick={() => choose('pickup')}><Store className="mr-2 h-4 w-4" />Pick-up</Button>
      <Button disabled={!activeLocation?.deliveryTypes.includes('delivery')} onClick={() => choose('delivery')}><Truck className="mr-2 h-4 w-4" />Delivery</Button>
    </DialogContent>
  </Dialog>;
}
