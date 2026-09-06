export const M3PIZZA_MENU_PATH = '/m3pizza/m3pizza/m3-pizza-hellerup';

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
