import type { Location } from '@/types';
export type DeliveryModalPayload = { brandSlug: string; locationSlug: string; location?: Location };
let listener: ((payload: DeliveryModalPayload) => void) | undefined;
// On the first page load the menu asks for the sheet in its first effect, before the layout's
// modal host has subscribed (child effects run first). Keep only that initial request and deliver
// it on the first subscription; once a host has existed, requests without one are dropped as stale.
let subscribedOnce = false;
let initial: DeliveryModalPayload | undefined;

export function openDeliveryModal(payload: DeliveryModalPayload) {
  if (listener) listener(payload);
  else if (!subscribedOnce) initial = payload;
}

export function subscribeDeliveryModal(next: (payload: DeliveryModalPayload) => void) {
  listener = next;
  const queued = subscribedOnce ? undefined : initial;
  subscribedOnce = true;
  initial = undefined;
  if (queued) next(queued);
  return () => { if (listener === next) listener = undefined; };
}
