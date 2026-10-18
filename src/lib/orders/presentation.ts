import type { OrderStatus } from '@/types';

// Customer- and staff-facing Danish names for every order status.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { Pending: 'Afventer betaling', Received: 'Modtaget', 'In Progress': 'Tilberedes', Ready: 'Klar', Completed: 'Afsluttet', Delivered: 'Leveret', Canceled: 'Annulleret', Error: 'Kontakt restauranten' };

export function canceledPickupPaymentLabel(order: { status?: unknown; paymentMethod?: unknown; paymentStatus?: unknown }): string | null {
  if (order.status !== 'Canceled' || order.paymentMethod !== 'PayAtPickup') return null;
  return order.paymentStatus === 'Paid'
    ? 'Betaling modtaget · refundering håndteres separat'
    : 'Ingen betaling modtaget';
}
