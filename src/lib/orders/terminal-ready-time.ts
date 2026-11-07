import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { getOrderTerminalActor, authorizeOrderTerminalTransaction, type OrderTerminalAuthSource } from '@/lib/terminal-auth/access';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const schema = z.object({ orderId: id, brandId: id, locationId: id, expectedReadyAt: z.string().datetime().nullable(), readyAt: z.string().datetime(), requestId: z.string().uuid() }).strict();
export class TerminalReadyTimeError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (value: any): string | null => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
export async function updateTerminalReadyTime(input: unknown, source: OrderTerminalAuthSource = 'admin', now = new Date()) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new TerminalReadyTimeError('terminal_time_invalid', 400);
  const command = parsed.data, db = getAdminDb();
  const actor = source === 'terminal' ? await getOrderTerminalActor('terminal') : null;
  const identity = actor ? null : await verifiedOrderflyIdentity(), actorId = actor?.actorId ?? principalKey(identity!);
  const ref = db.collection('orders').doc(command.orderId), fingerprint = hash(command);
  const audit = db.collection('auditLogs').doc(hash(['terminal-ready-time-v1', actorId, command.requestId]));
  return db.runTransaction(async tx => {
    const order = (await tx.get(ref)).data();
    if (!order || order.brandId !== command.brandId || order.locationId !== command.locationId) throw new AuthorityError('forbidden');
    if (actor) await authorizeOrderTerminalTransaction(tx, actor, { brandId: order.brandId, locationId: order.locationId });
    else await authorizeTransaction(tx, identity!, order, 'orderfly.orders:edit', 'location');
    const previous = (await tx.get(audit)).data();
    if (previous) {
      if (previous.fingerprint !== fingerprint || previous.actorId !== actorId || previous.action !== 'terminal_ready_time_changed') throw new TerminalReadyTimeError('terminal_time_conflict');
      return { success: true, changed: false, readyAt: iso(order.kitchenReadyAt) };
    }
    if (!['Received', 'In Progress'].includes(order.status) || iso(order.kitchenReadyAt) !== command.expectedReadyAt) throw new TerminalReadyTimeError('terminal_time_conflict');
    const readyAt = new Date(command.readyAt);
    if (readyAt.getTime() < now.getTime() - 60_000 || readyAt.getTime() > now.getTime() + 24 * 60 * 60_000) throw new TerminalReadyTimeError('terminal_time_invalid', 400);
    const timestamp = getAdminFieldValue().serverTimestamp();
    tx.update(ref, { kitchenReadyAt: readyAt, updatedAt: timestamp });
    tx.create(audit, { action: 'terminal_ready_time_changed', orderId: command.orderId, brandId: command.brandId, locationId: command.locationId,
      actorId, requestId: command.requestId, fingerprint, fromReadyAt: command.expectedReadyAt, toReadyAt: command.readyAt, createdAt: timestamp });
    return { success: true, changed: true, readyAt: readyAt.toISOString() };
  });
}
