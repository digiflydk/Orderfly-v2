/** Net paid value in DKK. Refunds are stored in integer øre. */
export function paidSaleAmount(order: {
  paymentStatus?: unknown;
  status?: unknown;
  totalAmount?: unknown;
  refundedAmountOre?: unknown;
}): number {
  if (order.paymentStatus !== 'Paid' || order.status === 'Canceled') return 0;
  if (typeof order.totalAmount !== 'number' || !Number.isFinite(order.totalAmount) || order.totalAmount < 0) return 0;

  const grossOre = Math.round(order.totalAmount * 100);
  const refundedOre = order.refundedAmountOre ?? 0;
  if (!Number.isSafeInteger(grossOre) || !Number.isSafeInteger(refundedOre) || (refundedOre as number) < 0) return 0;

  return Math.max(0, grossOre - (refundedOre as number)) / 100;
}

/** Only settled orders with remaining value count as sales. */
export function isPaidSale(order: Parameters<typeof paidSaleAmount>[0]): boolean {
  return paidSaleAmount(order) > 0;
}

export function sumNetPaidSales(orders: Array<{ paidSale?: unknown; netTotal?: unknown }>): number {
  return orders.reduce((sum, order) => sum + (order.paidSale === true && typeof order.netTotal === 'number' && Number.isFinite(order.netTotal) ? Math.max(0, order.netTotal) : 0), 0);
}
