import type { OrderDetail } from '@/types';
import { ORDER_STATUS_LABELS } from '@/lib/orders/presentation';

/** Server-projected delivery facts. Preparation time is never a promised pickup time. */
export type DeliveryPrintDetails = {
  address: string;
  requested: { kind: 'asap' } | { kind: 'scheduled'; earliest: string; latest: string } | null;
  pickupUnavailable?: 'cancelled' | 'failed';
  plannedPickup?: { earliest: string; latest: string } | null;
  reliablePickup: { earliest: string; latest: string } | null;
};

export type KitchenPreviewData = {
  delivery?: DeliveryPrintDetails;
  reference: string;
  brandName: string;
  locationName: string;
  customerName: string;
  customerPhone: string;
  fulfillmentType: string;
  fulfillmentAt?: string;
  fulfillmentLabel: string;
  status: string;
  canceled: boolean;
  notes: string;
  lines: Array<{
    name: string;
    quantity: number | null;
    category: string;
    modifiers: string[];
    groups: Array<{ name: string; products: Array<{ name: string; quantity: number | null }> }>;
  }>;
};

function instant(value: OrderDetail['fulfillmentAt']): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = typeof value === 'object' && 'toDate' in value ? value.toDate() : new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
  } catch { return undefined; }
}
function savedPhone(value: unknown): string {
  return typeof value === 'string' && value.trim().length >= 5 && value.length <= 50 && !/[\p{Cc}\p{Cf}]/u.test(value)
    ? value.trim() : '';
}
function quantity(value: number): number | null {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Kitchen production uses the saved order selections, never fiscal invoice lines.
 * Category labels are an optional, independently authorized current catalog
 * projection. Phone is the checkout snapshot only; historical orders may not
 * contain one. Never infer phone or sales channel from email or analytics.
 */
export function projectKitchenReceipt(order: OrderDetail, categories: Record<string, string> = {}, delivery?: DeliveryPrintDetails): KitchenPreviewData {
  return {
    delivery,
    reference: order.id,
    brandName: order.brandName,
    locationName: order.locationName,
    customerName: order.customerName,
    customerPhone: savedPhone(order.customerDetails?.phone),
    fulfillmentType: order.deliveryType === 'Pickup' ? 'Afhentning' : order.deliveryType === 'Delivery' ? 'Levering' : 'Ordretype ikke angivet',
    fulfillmentAt: instant(order.fulfillmentAt),
    fulfillmentLabel: order.deliveryTime || '',
    status: ORDER_STATUS_LABELS[order.status] ?? 'Status ukendt',
    canceled: order.status === 'Canceled',
    notes: order.customerDetails?.deliveryInstructions ?? '',
    lines: order.productItems.map(item => ({
      name: item.name,
      quantity: quantity(item.quantity),
      category: item.id && Object.prototype.hasOwnProperty.call(categories, item.id) && typeof categories[item.id] === 'string' && categories[item.id].trim()
        ? categories[item.id] : item.itemType === 'combo' ? 'Menuer' : 'Varer',
      // A topping may be an exclusion: never add a '+' which reverses its meaning.
      modifiers: [...(item.toppings ?? [])],
      groups: (item.comboSelections ?? []).map(group => {
        const products: Array<{ id: string; name: string; quantity: number | null }> = [];
        for (const product of group.products) {
          // Native combo choices store repeated product entries per one menu.
          // Keep different IDs/names separate and show totals across all menus.
          const existing = products.find(row => row.id === product.id && row.name === product.name);
          if (existing) existing.quantity = existing.quantity === null ? null : existing.quantity + item.quantity;
          else products.push({ id: product.id, name: product.name, quantity: quantity(item.quantity) });
        }
        return { name: group.groupName, products: products.map(({ name, quantity: count }) => ({ name, quantity: count })) };
      }),
    })),
  };
}

export const SAMPLE_KITCHEN_RECEIPT: KitchenPreviewData = {
  reference: 'EKSEMPEL-1042', brandName: 'Eksempelrestaurant', locationName: 'Centrum',
  customerName: 'Eksempelkunde', customerPhone: '+45 00 00 00 00',
  fulfillmentType: 'Afhentning', fulfillmentAt: '2026-10-23T16:30:00Z', fulfillmentLabel: '',
  status: 'Modtaget', canceled: false, notes: 'Pak de to menuer i hver sin pose.',
  lines: [
    { name: '3 for 2 pizza', quantity: 1, category: 'Pizza', modifiers: [], groups: [
      { name: 'Valgte pizzaer', products: [{ name: '2. Italiana', quantity: 1 }, { name: '4. Pepperoni', quantity: 1 }, { name: '9. Pollo Speciale', quantity: 1 }] },
    ] },
    { name: 'Burger menu', quantity: 2, category: 'Burgere', modifiers: ['Uden løg', 'Ekstra ost'], groups: [
      { name: 'Burger', products: [{ name: 'Kyllingburger', quantity: 2 }] },
      { name: 'Tilbehør', products: [{ name: 'Pommes frites', quantity: 2 }, { name: 'Chili mayo', quantity: 2 }] },
      { name: 'Drikkevarer', products: [{ name: 'Pepsi Max 0,33 l', quantity: 2 }] },
    ] },
  ],
};
