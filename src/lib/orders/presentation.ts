import type { OrderStatus } from '@/types';

// Customer- and staff-facing Danish names for every order status.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { Pending: 'Afventer betaling', Received: 'Modtaget', 'In Progress': 'Tilberedes', Ready: 'Klar', Completed: 'Afsluttet', Delivered: 'Leveret', Canceled: 'Annulleret', Error: 'Kontakt restauranten' };

/**
 * Refunds are stored as native refund markers (refundedAmountOre), while the
 * stored paymentStatus stays Paid (docs/delivery/payment-orchestration.md).
 * Views project a fully refunded order as Refunded; operator delivery queries,
 * customer tracking, the superadmin order detail and the merchant terminal agree.
 */
export function fullyRefunded(order: { totalAmount?: unknown; refundedAmountOre?: unknown }): boolean {
  return typeof order.totalAmount === 'number' && order.totalAmount > 0 && Number.isSafeInteger(order.refundedAmountOre)
    && (order.refundedAmountOre as number) >= Math.round(order.totalAmount * 100);
}
export function projectedPaymentStatus(order: { paymentStatus?: unknown; totalAmount?: unknown; refundedAmountOre?: unknown }): string | null {
  if (order.paymentStatus === 'Refunded' || fullyRefunded(order)) return 'Refunded';
  return typeof order.paymentStatus === 'string' ? order.paymentStatus : null;
}
/** Danish terminal label (translated via kds-english.json); `unpaid` is the view's wording for anything else. */
export function terminalPaymentLabel(order: { paymentStatus?: unknown; totalAmount?: unknown; refundedAmountOre?: unknown },
  unpaid: 'Ikke betalt' | 'Betaling mangler' = 'Ikke betalt', failed?: 'Betaling fejlet'): string {
  const status = projectedPaymentStatus(order);
  return status === 'Refunded' ? 'Refunderet' : status === 'Paid' ? 'Betalt' : status === 'Failed' && failed ? failed : unpaid;
}

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
