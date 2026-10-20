import { orderEntryUrl } from '@/lib/brand-subdomain';

export const M3PIZZA_MENU_PATH = '/esmeralda/amager';

export type M3PizzaDeliveryMethod = 'delivery' | 'pickup';

export function normalizeM3PizzaDeliveryMethod(
  value: string | null | undefined,
): M3PizzaDeliveryMethod {
  return value === 'delivery' ? 'delivery' : 'pickup';
}

export function getM3PizzaMenuHref(
  value: string | null | undefined,
): string {
  const deliveryMethod = normalizeM3PizzaDeliveryMethod(value);
  return `${M3PIZZA_MENU_PATH}?deliveryMethod=${deliveryMethod}`;
}

// The order entry on orderfly.dk continues on the brand subdomain
// (https://esmeralda.orderfly.dk/amager); other hosts keep the relative path.
export function getM3PizzaOrderEntryUrl(
  host: string | null | undefined,
  value: string | null | undefined,
): string {
  const [, brandSlug, locationSlug] = M3PIZZA_MENU_PATH.split('/');
  return `${orderEntryUrl(host, brandSlug, locationSlug)}?deliveryMethod=${normalizeM3PizzaDeliveryMethod(value)}`;
}

export function persistM3PizzaDeliveryMethod(
  deliveryMethod: M3PizzaDeliveryMethod,
): void {
  try {
    window.localStorage.setItem('deliveryMethod', deliveryMethod);
  } catch {
    // Storage can be unavailable under restrictive browser privacy policies.
    // The query parameter remains the source of truth for the destination page.
  }
}
