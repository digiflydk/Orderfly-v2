export function canceledPickupPaymentLabel(order: { status?: unknown; paymentMethod?: unknown; paymentStatus?: unknown }): string | null {
  if (order.status !== 'Canceled' || order.paymentMethod !== 'PayAtPickup') return null;
  return order.paymentStatus === 'Paid'
    ? 'Betaling modtaget · refundering håndteres separat'
    : 'Ingen betaling modtaget';
}
