import { z } from 'zod';
import { worldlineScopeSchema } from './worldline-settings';

/** Persisted at order creation. Never resolve today's merchant settings for an old payment. */
export const worldlineBindingSchema = z.object({
  provider: z.literal('worldline'), mode: z.enum(['test', 'live']),
  owner: worldlineScopeSchema, reference: z.string().regex(/^projects\/[a-z][a-z0-9-]{4,62}\/secrets\/orderfly-worldline-[a-f0-9]{64}-(test|live)\/versions\/[1-9][0-9]*$/),
  merchantNumber: z.string().regex(/^[TP][A-Za-z0-9]+$/), revision: z.number().int().positive(),
}).strict().superRefine((value, context) => {
  if (!value.merchantNumber.startsWith(value.mode === 'test' ? 'T' : 'P') || !value.reference.includes(`-${value.mode}/versions/`))
    context.addIssue({ code: 'custom', message: 'Payment environment mismatch' });
});
export type WorldlineBinding = z.infer<typeof worldlineBindingSchema>;
export const worldlineTransactionSchema = z.object({
  id: z.string().regex(/^[0-9]{1,32}$/), orderid: z.string(), merchantnumber: z.string(),
  status: z.string(), currency: z.object({ code: z.string(), minorunits: z.number().int() }),
  total: z.object({ authorized: z.number().int().nonnegative(), captured: z.number().int().nonnegative(), credited: z.number().int().nonnegative() }),
});
export type WorldlineTransaction = z.infer<typeof worldlineTransactionSchema>;
export function assertWorldlineTransaction(input: unknown, expected: {
  transactionId: string; orderId: string; merchantNumber: string; mode: 'test' | 'live'; amountMinor: number; currency: string;
}, requireCaptured = false): WorldlineTransaction {
  const value = worldlineTransactionSchema.parse(input);
  if (!Number.isSafeInteger(expected.amountMinor) || expected.amountMinor <= 0
    || !expected.merchantNumber.startsWith(expected.mode === 'test' ? 'T' : 'P')
    || value.id !== expected.transactionId || value.orderid !== expected.orderId || value.merchantnumber !== expected.merchantNumber
    || value.currency.code !== expected.currency || value.currency.minorunits !== 2
    || value.total.authorized !== expected.amountMinor || value.total.captured > expected.amountMinor
    || value.total.credited > value.total.captured) throw new Error('Worldline payment mismatch');
  if (requireCaptured && (value.status.toLowerCase() !== 'approved' || value.total.captured !== expected.amountMinor || value.total.credited !== 0))
    throw new Error('Worldline payment is not fully captured');
  return value;
}
