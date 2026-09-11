import type { Brand, Location, OrderDetail, OrderInvoice } from '@/types';
import { money } from '@/lib/money';

function address(...parts: Array<string | undefined>) {
  return parts.map(value => value?.trim()).filter(Boolean).join(', ');
}

function isoDate(value: OrderDetail['fulfillmentAt'], fallback: string) {
  if (!value) return fallback;
  const date = typeof value === 'object' && 'toDate' in value ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function invoiceCounterId(brandId: string, year: number) {
  return `${brandId}-${year}`;
}

export function invoiceNumber(year: number, sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('Invalid invoice sequence');
  return `INV-${year}-${String(sequence).padStart(6, '0')}`;
}

export function buildOrderInvoice(input: {
  order: OrderDetail;
  brand: Brand;
  location: Location;
  sequence: number;
  issuedAt: string;
  paymentReference?: string;
}): OrderInvoice {
  const { order, brand, location, sequence, issuedAt } = input;
  const vatRate = Number.isFinite(brand.vatPercentage) ? Math.max(0, brand.vatPercentage || 0) : 25;
  const vatAmount = money(order.paymentDetails.vatAmount ?? order.totalAmount * vatRate / (100 + vatRate));
  const customerAddress = order.deliveryType === 'Delivery' && order.customerDetails.address !== 'For Pickup'
    ? order.customerDetails.address : undefined;
  return {
    number: invoiceNumber(Number(issuedAt.slice(0, 4)), sequence),
    issuedAt,
    supplyDate: isoDate(order.fulfillmentAt, issuedAt),
    currency: brand.currency || 'DKK',
    seller: {
      legalName: brand.companyName || brand.name,
      tradingName: brand.name,
      registrationNumber: brand.companyRegNo,
      address: address(brand.street, `${brand.zipCode || ''} ${brand.city || ''}`.trim(), brand.country),
      ...(brand.supportEmail ? { email: brand.supportEmail } : {}),
    },
    fulfillmentLocation: {
      name: location.name,
      address: location.address || address(location.street, `${location.zipCode || ''} ${location.city || ''}`.trim(), location.country),
    },
    customer: { name: order.customerName, email: order.customerContact, ...(customerAddress ? { address: customerAddress } : {}) },
    lines: order.productItems.map(item => {
      const totalAmount = money(item.listTotalPrice ?? item.totalPrice);
      return { description: item.name, quantity: item.quantity, unitAmount: money(totalAmount / item.quantity), totalAmount };
    }),
    subtotal: money(order.paymentDetails.subtotal),
    itemDiscount: money(order.paymentDetails.itemDiscountTotal || 0),
    orderDiscount: money(order.paymentDetails.cartDiscountTotal || 0),
    deliveryFee: money(order.paymentDetails.deliveryFee || 0),
    bagFee: money(order.paymentDetails.bagFee || 0),
    adminFee: money(order.paymentDetails.adminFee || 0),
    taxableAmount: money(order.totalAmount - vatAmount),
    vatRate,
    vatAmount,
    totalAmount: money(order.totalAmount),
    paymentMethod: 'Stripe',
    ...(input.paymentReference ? { paymentReference: input.paymentReference } : {}),
  };
}
