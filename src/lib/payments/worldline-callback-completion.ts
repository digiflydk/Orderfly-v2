import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import { worldlineBindingSchema, type WorldlineBinding } from './worldline-verification';

type Expected = {
  orderId: string; brandId: string; locationId: string; transactionId: string;
  amountMinor: number; binding: WorldlineBinding;
};

/** The callback's signature is admission authority, never proof of capture.
 * Only the existing financial settlement can produce this complete native state.
 */
export function isWorldlineCallbackFinanciallyComplete(value: unknown, expected: Expected): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, any>, binding = worldlineBindingSchema.safeParse(row.paymentAgreement);
  const original = worldlineBindingSchema.safeParse(expected.binding);
  return original.success && binding.success && original.data.owner.brandId === expected.brandId
    && (!original.data.owner.locationId || original.data.owner.locationId === expected.locationId)
    && Number.isSafeInteger(expected.amountMinor) && expected.amountMinor > 0
    && row.id === expected.orderId && row.brandId === expected.brandId && row.locationId === expected.locationId
    && row.paymentMethod === 'Worldline' && row.paymentStatus === 'Paid'
    && ['Pending', 'Received', 'In Progress', 'Ready', 'Completed', 'Delivered', 'Error'].includes(row.status)
    && (row.paymentOperation === undefined || row.paymentOperation === null)
    && (row.refundedAmountOre === undefined || row.refundedAmountOre === 0)
    && (row.refundedAt === undefined || row.refundedAt === null)
    && row.psp?.provider === 'worldline' && row.psp.transactionId === expected.transactionId && row.psp.captured === true
    && typeof row.totalAmount === 'number' && Number.isFinite(row.totalAmount) && Math.round(row.totalAmount * 100) === expected.amountMinor
    && isDeepStrictEqual(binding.data, original.data);
}

/** Wait only for the native financial commit, not later delivery/notification work.
 * Both the observation loop and any stalled read are bounded. No provider request
 * or financial write is initiated here, and timeout never manufactures Paid.
 */
export async function waitForWorldlineCallbackFinancialCompletion(input: {
  expected: Expected; readOrder: () => Promise<unknown>; work?: Promise<unknown>;
  timeoutMs?: number; pollIntervalMs?: number; stopWhenWorkFinishes?: boolean;
}): Promise<boolean> {
  const timeoutMs = Number.isFinite(input.timeoutMs) ? Math.max(0, Math.min(10000, input.timeoutMs!)) : 3500;
  if (!timeoutMs) return false;
  const pollIntervalMs = Number.isFinite(input.pollIntervalMs) ? Math.max(1, Math.min(100, input.pollIntervalMs!)) : 100;
  let stopped = false, workFinished = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  const work = input.work?.then(() => { workFinished = true; }, () => { workFinished = true; });
  const observe = async (): Promise<boolean> => {
    while (!stopped) {
      let row: unknown;
      try { row = await input.readOrder(); } catch { return false; }
      if (stopped) return false;
      if (isWorldlineCallbackFinanciallyComplete(row, input.expected)) return true;
      if (workFinished && input.stopWhenWorkFinishes !== false) return false;
      const pause = new Promise<void>(resolve => { pollTimer = setTimeout(resolve, pollIntervalMs); });
      await (work && input.stopWhenWorkFinishes !== false ? Promise.race([pause, work]) : pause);
      clearTimeout(pollTimer);
    }
    return false;
  };
  try {
    return await Promise.race([
      observe(),
      new Promise<false>(resolve => { deadlineTimer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
  } finally {
    stopped = true;
    clearTimeout(deadlineTimer);
    clearTimeout(pollTimer);
  }
}
