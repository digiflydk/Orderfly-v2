import 'server-only';
import { isDeepStrictEqual } from 'node:util';
import { worldlineBindingSchema, type WorldlineBinding } from './worldline-verification';

type Expected = {
  orderId: string; brandId: string; locationId: string; transactionId: string;
  amountMinor: number; binding: WorldlineBinding;
};

/** Matches a native observation to the original immutable checkout agreement. */
function matchesOriginalPayment(value: unknown, expected: Expected): value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, any>, binding = worldlineBindingSchema.safeParse(row.paymentAgreement);
  const original = worldlineBindingSchema.safeParse(expected.binding);
  return original.success && binding.success && original.data.owner.brandId === expected.brandId
    && (!original.data.owner.locationId || original.data.owner.locationId === expected.locationId)
    && Number.isSafeInteger(expected.amountMinor) && expected.amountMinor > 0
    && row.id === expected.orderId && row.brandId === expected.brandId && row.locationId === expected.locationId
    && row.paymentMethod === 'Worldline' && row.psp?.provider === 'worldline'
    && row.psp.transactionId === expected.transactionId && /^[0-9]{1,32}$/.test(expected.transactionId)
    && (row.paymentOperation === undefined || row.paymentOperation === null)
    && typeof row.totalAmount === 'number' && Number.isFinite(row.totalAmount) && Math.round(row.totalAmount * 100) === expected.amountMinor
    && isDeepStrictEqual(binding.data, original.data);
}

/** The callback signature admits work, never proves capture. Refunds and
 * cancellations intentionally cannot satisfy this financial-success predicate. */
export function isWorldlineCallbackFinanciallyComplete(value: unknown, expected: Expected): boolean {
  if (!matchesOriginalPayment(value, expected)) return false;
  return value.paymentStatus === 'Paid' && value.psp.captured === true
    && ['Pending', 'Received', 'In Progress', 'Ready', 'Completed', 'Delivered', 'Error'].includes(value.status)
    && (value.refundedAmountOre === undefined || value.refundedAmountOre === 0)
    && (value.refundedAmount === undefined || value.refundedAmount === 0)
    && (value.refundedAt === undefined || value.refundedAt === null);
}

export type WorldlineTerminalOutcome = 'refunded' | 'partially_refunded' | 'canceled';

/** Native terminal facts are display candidates only. The return route must
 * independently verify the same transaction's full credit/deletion at Worldline. */
export function worldlineNativeTerminalOutcome(value: unknown, expected: Expected): WorldlineTerminalOutcome | null {
  if (!matchesOriginalPayment(value, expected)) return null;
  if (value.paymentStatus === 'Paid' && value.psp.captured === true
    && Number.isSafeInteger(value.refundedAmountOre) && value.refundedAmountOre > 0
    && value.refundedAmountOre <= expected.amountMinor && value.refundedAt != null
    && (value.refundedAmount === undefined || value.refundedAmount === value.refundedAmountOre / 100)
    && ['Pending', 'Received', 'In Progress', 'Ready', 'Completed', 'Delivered', 'Canceled', 'Error'].includes(value.status)) return value.refundedAmountOre === expected.amountMinor ? 'refunded' : 'partially_refunded';
  if (value.status === 'Canceled' && value.paymentStatus === 'Failed'
    && value.psp.captured !== true && (value.psp.voided === true || value.psp.sessionExpired === true)
    && (value.refundedAmountOre === undefined || value.refundedAmountOre === 0)
    && (value.refundedAmount === undefined || value.refundedAmount === 0)
    && value.refundedAt == null) return 'canceled';
  return null;
}

/** Wait only for the native financial commit, not later delivery/notification work.
 * Both the observation loop and any stalled read are bounded. No provider request
 * or financial write is initiated here, and timeout never manufactures Paid.
 */
type ObservationInput = {
  expected: Expected; readOrder: () => Promise<unknown>; work?: Promise<unknown>;
  timeoutMs?: number; pollIntervalMs?: number; stopWhenWorkFinishes?: boolean; retryReadFailures?: boolean;
};

async function observeOutcome<T>(input: ObservationInput, outcome: (row: unknown) => Promise<T | null>): Promise<T | null> {
  const timeoutMs = Number.isFinite(input.timeoutMs) ? Math.max(0, Math.min(60000, input.timeoutMs!)) : 3500;
  if (!timeoutMs) return null;
  const pollIntervalMs = Number.isFinite(input.pollIntervalMs) ? Math.max(1, Math.min(1000, input.pollIntervalMs!)) : 100;
  let stopped = false, workFinished = false;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  const work = input.work?.then(() => { workFinished = true; }, () => { workFinished = true; });
  const observe = async (): Promise<T | null> => {
    while (!stopped) {
      let row: unknown;
      try { row = await input.readOrder(); } catch { if (!input.retryReadFailures) return null; }
      if (stopped) return null;
      const resolved = await outcome(row);
      if (stopped) return null;
      if (resolved !== null) return resolved;
      if (workFinished && input.stopWhenWorkFinishes !== false) return null;
      const pause = new Promise<void>(resolve => { pollTimer = setTimeout(resolve, pollIntervalMs); });
      await (work && input.stopWhenWorkFinishes !== false ? Promise.race([pause, work]) : pause);
      clearTimeout(pollTimer);
    }
    return null;
  };
  try {
    return await Promise.race([
      observe(),
      new Promise<null>(resolve => { deadlineTimer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
  } finally {
    stopped = true;
    clearTimeout(deadlineTimer);
    clearTimeout(pollTimer);
  }
}

/** Existing callback callers can only complete with authoritative uncredited Paid. */
export async function waitForWorldlineCallbackFinancialCompletion(input: ObservationInput): Promise<boolean> {
  return await observeOutcome(input, async row => isWorldlineCallbackFinanciallyComplete(row, input.expected) ? true : null) === true;
}

/** Return display can finish with a verified terminal result without claiming
 * financial success or invoking any capture/refund/cancel mutation. */
export async function waitForWorldlineReturnOutcome(input: ObservationInput & {
  terminalOutcome: (row: unknown) => Promise<WorldlineTerminalOutcome | null>;
}): Promise<'paid' | WorldlineTerminalOutcome | null> {
  return observeOutcome(input, async row => isWorldlineCallbackFinanciallyComplete(row, input.expected) ? 'paid' : input.terminalOutcome(row));
}
