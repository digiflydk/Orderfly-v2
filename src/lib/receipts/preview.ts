import type { ReceiptBrandIdentity } from './brand-identity';
import type { OrderDetail } from '@/types';
import { ORDER_STATUS_LABELS } from '@/lib/orders/presentation';

export type ReceiptPreviewData = {
  reference: string; createdAt: string; paidAt?: string; invoiceNumber?: string;
  currency: string; brandName: string; locationName: string;
  logoUrl?: string;
  seller?: { name: string; registrationNumber: string; address: string };
  customerName: string; customerContact: string; notes: string;
  paymentStatus: string; status: string; paymentMethod: string; deliveryType: string;
  lines: Array<{ name: string; quantity: number; unitPrice: number; total: number; modifiers: string[] }>;
  subtotal: number; discount: number; deliveryFee: number; bagFee: number; adminFee: number;
  tips: number; vat?: number; total: number; refunded: number;
};

function date(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Allowlist only display data; never serialize the raw order/PSP/analytics objects. */
export function projectReceipt(order: OrderDetail, brandIdentity?: ReceiptBrandIdentity): ReceiptPreviewData {
  const invoice = order.invoice;
  const details = order.paymentDetails;
  return {
    reference: order.id, createdAt: date(order.createdAt) ?? '',
    paidAt: date(order.paidAt), invoiceNumber: invoice?.number,
    currency: invoice?.currency || 'DKK',
    brandName: invoice?.seller.tradingName ?? order.brandName,
    locationName: invoice?.fulfillmentLocation.name ?? order.locationName,
    logoUrl: brandIdentity?.logoUrl,
    seller: invoice ? { name: invoice.seller.legalName, registrationNumber: invoice.seller.registrationNumber, address: invoice.seller.address } : brandIdentity ? { name: brandIdentity.name, registrationNumber: brandIdentity.registrationNumber, address: brandIdentity.address } : undefined,
    customerName: invoice?.customer.name ?? order.customerName,
    customerContact: invoice?.customer.email ?? order.customerContact,
    notes: order.customerDetails?.deliveryInstructions ?? '',
    paymentStatus: ({ Paid: 'Betalt', Pending: 'Ikke betalt', Failed: 'Betaling mislykket' } as Record<string, string>)[order.paymentStatus] ?? order.paymentStatus,
    status: ORDER_STATUS_LABELS[order.status] ?? order.status,
    paymentMethod: invoice ? ({ Stripe: 'Online betaling', Cash: 'Kontant', CardInRestaurant: 'Kort i restaurant' })[invoice.paymentMethod]
      : order.paymentMethod === 'PayAtPickup' ? 'Betaling ved afhentning' : order.paymentMethod === 'Cash' ? 'Kontant' : order.paymentMethod === 'Stripe' ? 'Online betaling' : 'Anden betaling',
    deliveryType: order.deliveryType === 'Delivery' ? 'Levering' : 'Afhentning',
    // Invoice lines are immutable fiscal facts. Do not substitute mutable order lines.
    lines: invoice ? invoice.lines.map(line => ({ name: line.description, quantity: line.quantity, unitPrice: line.unitAmount, total: line.totalAmount, modifiers: [] }))
      : order.productItems.map(item => ({ name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, total: item.totalPrice,
        modifiers: [...(item.toppings ?? []), ...(item.comboSelections ?? []).map(group => `${group.groupName}: ${group.products.map(product => product.name).join(', ')}`)] })),
    subtotal: invoice?.subtotal ?? details.subtotal,
    discount: invoice ? invoice.itemDiscount + invoice.orderDiscount : details.discountTotal,
    deliveryFee: invoice?.deliveryFee ?? details.deliveryFee,
    bagFee: invoice?.bagFee ?? details.bagFee ?? 0, adminFee: invoice?.adminFee ?? details.adminFee ?? 0,
    tips: invoice ? 0 : details.tips ?? 0,
    vat: invoice?.vatAmount ?? details.vatAmount,
    total: invoice?.totalAmount ?? order.totalAmount,
    refunded: (order.refundedAmountOre ?? 0) / 100,
  };
}

export const SAMPLE_RECEIPT: ReceiptPreviewData = {
  reference: 'EKSEMPEL-1042', createdAt: '2026-10-22T10:30:00Z', paidAt: '2026-10-22T10:31:00Z', currency: 'DKK',
  brandName: 'Eksempelrestaurant', locationName: 'Centrum', customerName: 'Eksempelkunde', customerContact: 'kunde@example.com',
  notes: 'Ring på ved levering', paymentStatus: 'Betalt', status: 'Afsluttet', paymentMethod: 'Online betaling', deliveryType: 'Afhentning',
  lines: [{ name: 'Burger med ost', quantity: 2, unitPrice: 89, total: 178, modifiers: ['Ekstra ost', 'Uden løg'] }, { name: 'Sodavand', quantity: 1, unitPrice: 25, total: 25, modifiers: [] }],
  subtotal: 203, discount: 0, deliveryFee: 0, bagFee: 5, adminFee: 0, tips: 0, vat: 41.6, total: 208, refunded: 0,
};
