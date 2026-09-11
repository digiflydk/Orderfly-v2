import type { OrderDetail, OrderInvoice } from '@/types';

export type PaidOrderJob = {
  orderId: string;
  brandId: string;
  locationId: string;
  customerId: string;
  kind: 'paidOrder';
  eventId: string;
  eventTime: string;
  state: 'pending' | 'dispatching' | 'failed' | 'uncertain' | 'accepted' | 'suppressed';
  attempts: number;
  nextAttemptAt: number;
  lease?: string | null;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const amount = (value: number) => Math.round(value * 100) / 100;

export function normalizedEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length <= 254 && emailPattern.test(email) ? email : null;
}

function bounded(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function buildPaidOrderEvent(order: OrderDetail, invoice: OrderInvoice, job: Pick<PaidOrderJob, 'eventId' | 'eventTime'>, email: string) {
  if (order.paymentStatus !== 'Paid' || order.status === 'Canceled') throw new Error('order_not_paid');
  const safeEmail = normalizedEmail(email);
  if (!safeEmail || safeEmail !== normalizedEmail(order.customerContact)) throw new Error('order_email_mismatch');
  const currency = bounded(invoice.currency, 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || !invoice.lines.length || invoice.lines.length > 100) throw new Error('invalid_order_event');
  const lineItems = invoice.lines.map((line, index) => {
    const item = order.productItems[index];
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.unitAmount) || !Number.isFinite(line.totalAmount)) throw new Error('invalid_order_event');
    return {
      productID: bounded(item?.id, 128) || `${order.id}-${index + 1}`,
      productTitle: bounded(line.description, 255),
      productQuantity: line.quantity,
      productPrice: amount(item?.totalPrice && item.quantity ? item.totalPrice / item.quantity : line.unitAmount),
      productDiscount: amount(Math.max(0, line.unitAmount - (item?.totalPrice && item.quantity ? item.totalPrice / item.quantity : line.unitAmount))),
    };
  });
  const amounts = [invoice.subtotal, invoice.itemDiscount, invoice.orderDiscount, invoice.deliveryFee, invoice.totalAmount, invoice.vatAmount];
  if (amounts.some(value => !Number.isFinite(value) || value < 0)) throw new Error('invalid_order_event');
  return {
    eventName: 'paid for order',
    origin: 'api',
    eventVersion: 'v2',
    eventID: job.eventId,
    eventTime: job.eventTime,
    contact: { email: safeEmail },
    properties: {
      orderID: bounded(order.id, 128),
      orderNumber: bounded(invoice.number, 128),
      createdAt: invoice.issuedAt,
      currency,
      paymentMethod: bounded(invoice.paymentMethod, 64),
      paymentStatus: 'paid',
      fulfillmentStatus: 'unfulfilled',
      shippingMethod: order.deliveryType,
      shippingPrice: amount(invoice.deliveryFee),
      subTotalPrice: amount(invoice.subtotal),
      subTotalTaxIncluded: true,
      totalDiscount: amount(invoice.itemDiscount + invoice.orderDiscount),
      totalPrice: amount(invoice.totalAmount),
      totalTax: amount(invoice.vatAmount),
      lineItems,
      tags: ['orderfly', `brand:${bounded(order.brandId, 128)}`, `location:${bounded(order.locationId, 128)}`],
    },
  };
}
