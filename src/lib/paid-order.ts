/** Only settled, non-canceled orders count as sales. Keep checkout attempts in history. */
export function isPaidSale(order: { paymentStatus?: string; status?: string }): boolean {
  return order.paymentStatus === 'Paid' && order.status !== 'Canceled';
}
