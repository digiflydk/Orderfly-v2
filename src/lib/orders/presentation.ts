import type { OrderStatus } from '@/types';

// Customer- and staff-facing Danish names for every order status.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { Pending: 'Afventer betaling', Received: 'Modtaget', 'In Progress': 'Tilberedes', Ready: 'Klar', Completed: 'Afsluttet', Delivered: 'Leveret', Canceled: 'Annulleret', Error: 'Kontakt restauranten' };

export function canceledPickupPaymentLabel(order: { status?: unknown; paymentMethod?: unknown; paymentStatus?: unknown }): string | null {
  if (order.status !== 'Canceled' || order.paymentMethod !== 'PayAtPickup') return null;
  return order.paymentStatus === 'Paid'
    ? 'Betaling modtaget · refundering håndteres separat'
    : 'Ingen betaling modtaget';
}

// Only paid orders have a payment time, so a missing one means the order is not paid.
export function formatPaidAt(value?: string): string {
  if (!value) {
    return 'Ikke betalt';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Ukendt dato';
  }

  return new Intl.DateTimeFormat('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Copenhagen',
  }).format(date);
}
