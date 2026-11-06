import type { Location } from '@/types';
export type DeliveryModalPayload = { brandSlug: string; locationSlug: string; location?: Location };
let listener: ((payload: DeliveryModalPayload) => void) | undefined;

export function openDeliveryModal(payload: DeliveryModalPayload) {
  listener?.(payload);
}

export function subscribeDeliveryModal(next: (payload: DeliveryModalPayload) => void) {
  listener = next;
  return () => { if (listener === next) listener = undefined; };
}
