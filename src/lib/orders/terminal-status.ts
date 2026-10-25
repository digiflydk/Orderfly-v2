import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { queueOrderFeedback } from '@/lib/feedback/mail-queue';
import { getOrderTerminalActor, authorizeOrderTerminalTransaction, type OrderTerminalAuthSource } from '@/lib/terminal-auth/access';
import type { OrderStatus } from '@/types';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const terminalStatusCommandSchema = z.object({
  orderId: identifier, brandId: identifier, locationId: identifier,
  expectedStatus: z.enum(['Received', 'In Progress', 'Ready']),
  status: z.enum(['In Progress', 'Ready', 'Completed', 'Delivered']),
  requestId: z.string().uuid(),
}).strict();
export type TerminalStatusCommand = z.infer<typeof terminalStatusCommandSchema>;
export class TerminalStatusError extends Error {
  constructor(public code: 'terminal_status_invalid' | 'terminal_status_conflict' | 'terminal_payment_required', public status = 409) { super(code); }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Only fulfillment progress. Payment and cancellation remain separate workflows. */
export async function progressTerminalOrder(input: unknown, source: OrderTerminalAuthSource = 'admin'): Promise<{success: true; changed: boolean; orderId: string; status: OrderStatus}> {
  const parsed = terminalStatusCommandSchema.safeParse(input);
  if (!parsed.success) throw new TerminalStatusError('terminal_status_invalid', 400);
  const command = parsed.data, actor = source === 'terminal' ? await getOrderTerminalActor('terminal') : null;
  const identity = actor ? null : await verifiedOrderflyIdentity(), actorId = actor?.actorId ?? principalKey(identity!), db = getAdminDb();
  const orderRef = db.collection('orders').doc(command.orderId);
  // One request ID is bound to one actor and payload, including the order/scope.
  // Store the immutable command in the audit record so retries cannot repeat it.
  const auditRef = db.collection('auditLogs').doc(hash(['terminal-status-v1', actorId, command.requestId]));
  const fingerprint = hash(command);
  const result = await db.runTransaction(async tx => {
    const order = (await tx.get(orderRef)).data();
    if (!order || order.brandId !== command.brandId || order.locationId !== command.locationId) throw new AuthorityError('forbidden');
    if (actor) await authorizeOrderTerminalTransaction(tx, actor, { brandId: order.brandId, locationId: order.locationId });
    else await authorizeTransaction(tx, identity!, order, 'orderfly.orders:edit', 'location');
    const previous = (await tx.get(auditRef)).data();
    if (previous) {
      if (previous.action !== 'terminal_order_progressed' || previous.fingerprint !== fingerprint || previous.actorId !== actorId) throw new TerminalStatusError('terminal_status_conflict');
      return { changed: false, status: order.status as OrderStatus };
    }
    const next = order.status === 'Received' ? 'In Progress' : order.status === 'In Progress' ? 'Ready'
      : order.status === 'Ready' && order.deliveryType === 'Pickup' ? 'Completed'
      : order.status === 'Ready' && order.deliveryType === 'Delivery' ? 'Delivered' : null;
    if (!['Pickup', 'Delivery'].includes(order.deliveryType) || order.status !== command.expectedStatus || command.status !== next) throw new TerminalStatusError('terminal_status_conflict');
    const acceptedUnpaidPickup = order.paymentMethod === 'PayAtPickup' && order.deliveryType === 'Pickup'
      && !order.psp && order.paymentStatus === 'Pending' && order.discountReservation === 'held';
    if (order.paymentStatus !== 'Paid' && !(acceptedUnpaidPickup && ['In Progress', 'Ready'].includes(command.status))) throw new TerminalStatusError('terminal_payment_required');
    const now = getAdminFieldValue().serverTimestamp();
    tx.update(orderRef, { status: command.status, updatedAt: now });
    tx.create(auditRef, { action: 'terminal_order_progressed', orderId: command.orderId, brandId: command.brandId,
      locationId: command.locationId, actorId, fromStatus: command.expectedStatus, toStatus: command.status,
      requestId: command.requestId, fingerprint, createdAt: now });
    return { changed: true, status: command.status };
  });
  // Existing deterministic feedback queue deduplicates by order. A retry may
  // recover an optional queue failure without repeating the fulfillment write.
  if (['Completed', 'Delivered'].includes(command.status) && ['Completed', 'Delivered'].includes(result.status)) {
    try { await queueOrderFeedback(command.orderId, true); } catch { /* Optional messaging never rolls back saved fulfillment. */ }
  }
  return { success: true, orderId: command.orderId, ...result };
}
