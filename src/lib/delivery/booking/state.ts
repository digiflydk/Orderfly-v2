import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const timestamp = z.number().int().nonnegative().safe();
const scopeSchema = z.object({ brandId: id, locationId: id, orderId: id }).strict();
export const bookingIntentSchema = z.object({
  schemaVersion: z.literal(1), scope: scopeSchema, provider: id, intentId: id,
  reference: id, requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.number().int().nonnegative().safe(),
  state: z.enum(['pending', 'submitting', 'unknown', 'booked', 'rejected']),
  providerDeliveryId: z.string().min(1).max(256).nullable(),
  createdAt: timestamp, updatedAt: timestamp,
}).strict().superRefine((value, ctx) => {
  if (value.updatedAt < value.createdAt || (value.state === 'booked') !== (value.providerDeliveryId !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid booking state' });
  }
});
export type BookingIntent = z.infer<typeof bookingIntentSchema>;
const commandSchema = z.object({
  scope: scopeSchema, intentId: id, reference: id, requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
  expectedRevision: z.number().int().nonnegative().safe(), now: timestamp,
  outcome: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('submit') }).strict(),
    z.object({ kind: z.literal('unknown') }).strict(),
    z.object({ kind: z.literal('accepted'), providerDeliveryId: z.string().min(1).max(256) }).strict(),
    // Caller must only use this after definitive no-booking evidence, not timeout/not-found.
    z.object({ kind: z.literal('rejected') }).strict(),
  ]),
}).strict();
export class BookingStateError extends Error {
  constructor(public code: 'invalid' | 'scope' | 'conflict' | 'transition') { super(`delivery_booking_${code}`); }
}

/** Pure transaction planner. It is not authorization, persistence or a dispatch permission. */
export function transitionBookingIntent(rawIntent: unknown, rawCommand: unknown): BookingIntent {
  const parsedIntent = bookingIntentSchema.safeParse(rawIntent), parsedCommand = commandSchema.safeParse(rawCommand);
  if (!parsedIntent.success || !parsedCommand.success) throw new BookingStateError('invalid');
  const current = parsedIntent.data, command = parsedCommand.data;
  if (current.intentId !== command.intentId || current.reference !== command.reference || current.requestDigest !== command.requestDigest
    || current.scope.brandId !== command.scope.brandId || current.scope.locationId !== command.scope.locationId || current.scope.orderId !== command.scope.orderId) throw new BookingStateError('scope');
  if (current.revision !== command.expectedRevision || command.now < current.updatedAt || current.revision === Number.MAX_SAFE_INTEGER) throw new BookingStateError('conflict');
  const outcome = command.outcome;
  if (outcome.kind === 'submit') {
    if (current.state !== 'pending') throw new BookingStateError('transition');
    return { ...current, revision: current.revision + 1, state: 'submitting', updatedAt: command.now };
  }
  if (current.state === 'booked' && outcome.kind === 'accepted' && current.providerDeliveryId === outcome.providerDeliveryId
    || current.state === 'rejected' && outcome.kind === 'rejected'
    || current.state === 'unknown' && outcome.kind === 'unknown') return current;
  if (!['submitting', 'unknown'].includes(current.state)) throw new BookingStateError('transition');
  return { ...current, revision: current.revision + 1, state: outcome.kind === 'accepted' ? 'booked' : outcome.kind,
    providerDeliveryId: outcome.kind === 'accepted' ? outcome.providerDeliveryId : null, updatedAt: command.now };
}
