'use server';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { orderflySession } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { getAdminDb } from '@/lib/firebase-admin';
import { worldlineBindingSchema } from '@/lib/payments/worldline-verification';
import { runWorldlineOperation } from '@/lib/payments/worldline-operations';

const orderIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const inputSchema = z.discriminatedUnion('operation', [
  z.object({ orderId: orderIdSchema, requestId: z.string().uuid(), operation: z.literal('credit'), amountMinor: z.number().int().positive().max(2147483647) }).strict(),
  z.object({ orderId: orderIdSchema, requestId: z.string().uuid(), operation: z.literal('delete') }).strict(),
]);

const pendingSchema = z.object({ requestId: z.string().uuid(), operation: z.enum(['credit', 'delete']), amountMinor: z.number().int().positive().nullable(), actorId: z.string(), state: z.enum(['sending', 'unknown']) });

/** Metadata projection only. Secret references and credentials never enter the admin client. */
export async function loadWorldlineOrderPayment(input: unknown) {
  const orderId = orderIdSchema.parse(input), actor = await orderflySession(), db = getAdminDb();
  return db.runTransaction(async transaction => {
    const ref = db.collection('orders').doc(orderId), snapshot = await transaction.get(ref), order = snapshot.data();
    if (!order) throw new Error('Ordren findes ikke.');
    await authorizeTransaction(transaction, actor.identity, order, 'orderfly.orders:view', 'location');
    if (order.psp?.provider !== 'worldline') return null;
    const pin = worldlineBindingSchema.safeParse(order.paymentAgreement);
    if (!pin.success || pin.data.owner.brandId !== order.brandId || pin.data.owner.locationId && pin.data.owner.locationId !== order.locationId) throw new Error('Ordren mangler en gyldig betalingsaftale.');
    const amountMinor = Math.round(Number(order.totalAmount) * 100), refundedMinor = order.refundedAmountOre ?? 0;
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isSafeInteger(refundedMinor) || refundedMinor < 0 || refundedMinor > amountMinor) throw new Error('Ordren har ugyldige betalingstal.');
    let pending: { requestId: string; operation: 'credit' | 'delete'; amountMinor?: number } | null = null;
    if (typeof order.paymentOperation === 'string' && /^[a-f0-9]{64}$/.test(order.paymentOperation)) {
      const operation = await transaction.get(ref.collection('paymentOperations').doc(order.paymentOperation));
      const parsed = pendingSchema.safeParse(operation.data());
      if (parsed.success && parsed.data.actorId === actor.actorId) pending = { requestId: parsed.data.requestId, operation: parsed.data.operation, ...(parsed.data.amountMinor !== null ? { amountMinor: parsed.data.amountMinor } : {}) };
    }
    return {
      provider: 'worldline' as const, environment: pin.data.mode, agreement: pin.data.owner.locationId ? 'location' as const : 'brand' as const,
      merchantNumber: pin.data.merchantNumber, paymentStatus: String(order.paymentStatus), voided: order.psp?.voided === true,
      amountMinor, refundedMinor, remainingMinor: amountMinor - refundedMinor, locked: !!order.paymentOperation, managedDelivery: !!order.managedDelivery,
      canVoid: !order.managedDelivery && !order.paymentOperation && order.paymentStatus === 'Pending' && !!order.psp.transactionId && order.psp.voided !== true,
      canRefund: !order.managedDelivery && !order.paymentOperation && order.paymentStatus === 'Paid' && amountMinor > refundedMinor,
      pending,
    };
  });
}

/** Authenticated admin entry; the browser cannot choose provider reference, actor, scope or credentials. */
export async function worldlineOrderOperation(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error('Kontrollér betalingshandlingen og beløbet.');
  const value = parsed.data, actor = await orderflySession(), db = getAdminDb();
  const authorized = await db.runTransaction(async transaction => {
    const ref = db.collection('orders').doc(value.orderId), snapshot = await transaction.get(ref), order = snapshot.data();
    if (!order) throw new Error('Ordren findes ikke.');
    await authorizeTransaction(transaction, actor.identity, order, 'orderfly.orders:edit', 'location');
    if (order.psp?.provider !== 'worldline' || !order.psp.transactionId) throw new Error('Ordren har ingen Worldline-betaling.');
    const previous = (await transaction.get(ref.collection('paymentOperations').doc(createHash('sha256').update(value.requestId).digest('hex')))).data();
    if (previous && (previous.actorId !== actor.actorId || previous.requestId !== value.requestId || previous.operation !== value.operation || previous.transactionId !== order.psp.transactionId || previous.orderId !== value.orderId || previous.amountMinor !== ('amountMinor' in value ? value.amountMinor : null))) throw new Error('Betalingsanmodningen matcher ikke den gemte handling.');
    if (order.managedDelivery) throw new Error('Betalingsændringer for administreret levering håndteres gennem leveringsflowet.');
    if (!previous && value.operation === 'credit' && order.paymentStatus !== 'Paid') throw new Error('Kun hævede betalinger kan refunderes.');
    if (!previous && value.operation === 'delete' && order.paymentStatus !== 'Pending' && !order.psp.voided) throw new Error('En hævet betaling skal refunderes.');
    const maximum = Math.round(Number(order.totalAmount) * 100) - Number(order.refundedAmountOre ?? 0);
    const rejection = !previous && value.operation === 'credit' && (!Number.isSafeInteger(maximum) || value.amountMinor > maximum) ? 'Beløbet overstiger ordrens resterende betaling. Genindlæs betalingsstatus.' : null;
    return { transactionId: order.psp.transactionId as string, rejection };
  });
  if (authorized.rejection) return { state: 'rejected' as const, message: authorized.rejection };
  const transactionId = authorized.transactionId;
  try {
    const result = await runWorldlineOperation({ ...value, transactionId, actorId: actor.actorId });
    if (result.state === 'confirmed' && value.operation === 'delete') {
      const { finalizeWorldlineVoid } = await import('@/lib/payments/worldline-expiry');
      await finalizeWorldlineVoid(value.orderId, transactionId);
    }
    return result;
  } catch {
    // A failed transport/commit must preserve the same operation id for reconciliation.
    throw new Error('Betalingsoperationen kunne ikke bekræftes. Kontrollér samme anmodning før en ny handling.');
  }
}
