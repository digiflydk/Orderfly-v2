'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cart-context';
import { OrderModal } from '@/components/storefront/OrderModal';
import type { Location } from '@/types';
type Payload = {brandSlug: string; locationSlug: string; location?: Location};
let open: ((payload: Payload) => void) | null = null;
export function openDeliveryModal(payload: Payload) { open?.(payload); }
// Same bottom sheet as the brand landing "Bestil nu" flow, so the restaurant picker looks identical.
export default function DeliveryMethodModal() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const {location, setDeliveryType} = useCart();
  const router = useRouter();
  useEffect(() => {open = setPayload; return () => {open = null;};}, []);
  const activeLocation = payload?.location || location;
  function choose(method: 'takeaway' | 'delivery') {
    const mode = method === 'delivery' ? 'delivery' : 'pickup';
    if (!payload || !activeLocation?.deliveryTypes.includes(mode)) return;
    setDeliveryType(mode);
    router.push(`/${payload.brandSlug}/${payload.locationSlug}?deliveryMethod=${mode}`);
    setPayload(null);
  }
  return <OrderModal open={!!payload} onOpenChange={value => {if (!value) setPayload(null);}}
    onDeliveryMethodSelected={choose} modes={activeLocation?.deliveryTypes ?? []} />;
}
