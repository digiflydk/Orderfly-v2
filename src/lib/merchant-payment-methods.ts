import { z } from 'zod';

export const locationPaymentMethodsSchema = z.object({
  online: z.boolean(),
  payAtPickup: z.boolean(),
}).strict().refine(value => value.online || value.payAtPickup, 'Mindst én betalingsmetode skal være aktiv.');
export type LocationPaymentMethods = z.infer<typeof locationPaymentMethodsSchema>;
export type CheckoutPaymentMethod = 'online' | 'pay_at_pickup';
export type RestaurantPaymentForm = 'cash' | 'card';

// Lazy, backwards-compatible migration: existing locations remain online-only.
// Explicitly disabled methods are never silently re-enabled.
export function locationPaymentMethods(location: { paymentMethods?: LocationPaymentMethods }): LocationPaymentMethods {
  return location.paymentMethods == null ? { online: true, payAtPickup: false }
    : { online: location.paymentMethods.online === true, payAtPickup: location.paymentMethods.payAtPickup === true };
}
export function availableCheckoutMethods(location: { paymentMethods?: LocationPaymentMethods }, mode: 'pickup' | 'delivery') {
  const enabled = locationPaymentMethods(location);
  return [enabled.online ? 'online' : null, enabled.payAtPickup && mode === 'pickup' ? 'pay_at_pickup' : null]
    .filter((method): method is CheckoutPaymentMethod => method !== null);
}
export function assertCheckoutPaymentMethod(location: { paymentMethods?: LocationPaymentMethods }, mode: 'pickup' | 'delivery', method: CheckoutPaymentMethod) {
  if (!availableCheckoutMethods(location, mode).includes(method)) {
    throw new Error(method === 'pay_at_pickup' && mode !== 'pickup'
      ? 'Betal ved afhentning kan kun bruges til afhentningsordrer.'
      : 'Betalingsmetoden er ikke aktiv hos denne restaurant. Genindlæs kassen.');
  }
}
export function paymentMethodLabel(order: { paymentMethod?: string; paymentStatus?: string; paymentCollection?: { method: RestaurantPaymentForm } }) {
  if (order.paymentMethod === 'PayAtPickup') {
    if (order.paymentStatus === 'Paid') return order.paymentCollection?.method === 'cash' ? 'Betalt kontant i restaurant' : 'Betalt med kort i restaurant';
    return 'Betales ved afhentning';
  }
  return order.paymentMethod === 'Cash' ? 'Kontant' : 'Online betaling';
}
