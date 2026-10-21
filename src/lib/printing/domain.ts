import { createHash } from 'node:crypto';

/** Server-side printing foundations. No device credentials belong in this model. */
export type PrintScope = { brandId: string; locationId: string };
export type PrinterConfiguration = PrintScope & {
  id: string;
  name: string;
  manufacturer: 'star';
  model: 'mc-print2' | 'mc-print3';
  transport: 'cloudprnt-http' | 'cloudprnt-mqtt';
  state: 'active' | 'paused' | 'disabled';
  paperWidthMm: 58 | 80;
};
export type PrintJobKind = 'kitchen' | 'packing';
export type PrintJobIdentity = PrintScope & {
  orderId: string;
  printerId: string;
  kind: PrintJobKind;
  /** Initial production is revision 0, independent of payment/webhook event. */
  revision: number;
};
export type PrintJobState = 'scheduled' | 'queued' | 'dispatching' | 'confirmed'
  | 'failed' | 'uncertain' | 'canceled' | 'expired';
export type PrintJob = PrintJobIdentity & {
  id: string;
  state: PrintJobState;
  createdAt: number;
  updatedAt: number;
  notBefore: number;
  attempts: number;
};

// These inputs represent persisted server state, never a client's payment claim.
export type KitchenOrder = PrintScope & {
  id: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  deliveryType: string;
  discountReservation?: string;
  psp?: unknown;
};
export type PrintEligibility = { eligible: true } | {
  eligible: false;
  reason: 'invalid_scope' | 'scope_mismatch' | 'printer_inactive'
    | 'order_not_in_production' | 'payment_not_eligible';
};

const validId = (value: unknown): value is string => typeof value === 'string'
  && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validScope = (value: PrintScope) => validId(value.brandId) && validId(value.locationId);

/** A stable queue key; distinct arrays avoid ambiguous delimiter concatenation. */
export function printJobId(identity: PrintJobIdentity): string {
  if (!validScope(identity) || !validId(identity.orderId) || !validId(identity.printerId)
    || !['kitchen', 'packing'].includes(identity.kind)
    || !Number.isSafeInteger(identity.revision) || identity.revision < 0) {
    throw new Error('Invalid print job identity');
  }
  return createHash('sha256').update(JSON.stringify([
    'orderfly-print-v1', identity.brandId, identity.locationId, identity.orderId,
    identity.printerId, identity.kind, identity.revision,
  ])).digest('hex');
}

/** Intent acceptance includes paused printers; this never authorizes dispatch. */
export function kitchenPrintIntentEligibility(order: KitchenOrder, printer: PrinterConfiguration): PrintEligibility {
  if (!validScope(order) || !validScope(printer) || !validId(order.id) || !validId(printer.id)) {
    return { eligible: false, reason: 'invalid_scope' };
  }
  if (order.brandId !== printer.brandId || order.locationId !== printer.locationId) {
    return { eligible: false, reason: 'scope_mismatch' };
  }
  if (!['active', 'paused'].includes(printer.state)) return { eligible: false, reason: 'printer_inactive' };
  // Terminal orders must never start old kitchen production after reconnecting.
  if (!['Received', 'In Progress', 'Ready'].includes(order.status)) {
    return { eligible: false, reason: 'order_not_in_production' };
  }
  const eligible = ['Pickup', 'Delivery'].includes(order.deliveryType) && (
    (order.paymentMethod === 'Stripe' && order.paymentStatus === 'Paid')
    || (order.paymentMethod === 'PayAtPickup' && order.deliveryType === 'Pickup' && !order.psp
      && (order.paymentStatus === 'Paid'
        || (order.paymentStatus === 'Pending' && order.discountReservation === 'held')))
  );
  return eligible ? { eligible: true } : { eligible: false, reason: 'payment_not_eligible' };
}

/** Dispatch still requires capability, production flag and queue review gates. */
export function kitchenPrintEligibility(order: KitchenOrder, printer: PrinterConfiguration): PrintEligibility {
  const intent = kitchenPrintIntentEligibility(order, printer);
  if (!intent.eligible) return intent;
  return printer.state === 'active' ? intent : { eligible: false, reason: 'printer_inactive' };
}
