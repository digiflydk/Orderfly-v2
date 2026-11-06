'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { subscribeDeliveryModal, type DeliveryModalPayload } from '@/lib/delivery-modal-state';
export { openDeliveryModal } from '@/lib/delivery-modal-state';

const DeliveryMethodContent = dynamic(() => import('./delivery-method-content'), { ssr: false });

/** Register the small event bridge immediately; fetch dialog code only when requested. */
export default function DeliveryMethodModal() {
  const [payload, setPayload] = useState<DeliveryModalPayload | null>(null);
  useEffect(() => subscribeDeliveryModal(setPayload), []);
  return payload ? <DeliveryMethodContent payload={payload} onClose={() => setPayload(null)} /> : null;
}
