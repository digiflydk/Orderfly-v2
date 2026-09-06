export const M3PIZZA_MENU_PATH = '/cphpizza/m3-pizza-hellerup';

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
