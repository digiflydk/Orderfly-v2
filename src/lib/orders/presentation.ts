import type { OrderStatus } from '@/types';

// Customer- and staff-facing Danish names for every order status.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { Pending: 'Afventer betaling', Received: 'Modtaget', 'In Progress': 'Tilberedes', Ready: 'Klar', Completed: 'Afsluttet', Delivered: 'Leveret', Canceled: 'Annulleret', Error: 'Kontakt restauranten' };

export function canceledPickupPaymentLabel(order: { status?: unknown; paymentMethod?: unknown; paymentStatus?: unknown }): string | null {
  if (order.status !== 'Canceled' || order.paymentMethod !== 'PayAtPickup') return null;
  return order.paymentStatus === 'Paid'
    ? 'Betaling modtaget · refundering håndteres separat'
    : 'Ingen betaling modtaget';
}

// The payment status decides "not paid"; a paid order with a missing or malformed time is an unknown date.
export function formatPaidAt(value: string | undefined, paymentStatus: unknown): string {
  if (paymentStatus !== 'Paid') {
    return 'Ikke betalt';
  }

  const date = new Date(value || '');

  if (!value || Number.isNaN(date.getTime())) {
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
