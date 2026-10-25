import 'server-only';
import { z } from 'zod';
import type { WoltWriteTransport } from './create';

const scope = z.object({ brandId: z.string().min(1).max(200), locationId: z.string().min(1).max(200) }).strict();
const cancelSchema = z.object({
  scope,
  // Loaded by the authorized shared attempt repository, never a caller-selected ID.
  delivery: scope.extend({ woltOrderReferenceId: z.string().regex(/^[A-Za-z0-9_.:-]{1,200}$/), pickupStarted: z.boolean(), pickupCompleted: z.boolean() }).strict(),
  reason: z.string().trim().min(1).max(500),
}).strict();
export type WoltCancelInput = z.input<typeof cancelSchema>;
export type WoltCancelResult =
  | { kind: 'cancelled'; confirmedFee: null }
  | { kind: 'not_cancellable'; code: 'PICKUP_STARTED' | 'INVALID_ORDER_STATE_TRANSITION'; confirmedFee: null }
  | { kind: 'unknown'; code: string; confirmedFee: null };

export async function cancelWoltDelivery(raw: WoltCancelInput, transport: WoltWriteTransport): Promise<WoltCancelResult> {
  const input = cancelSchema.parse(raw);
  if (input.scope.brandId !== input.delivery.brandId || input.scope.locationId !== input.delivery.locationId) throw new Error('SCOPE_MISMATCH');
  // Late cancellation stays disabled, even if a remote account permits it;
  // contract/fee acceptance requires a separately coordinated capability.
  if (input.delivery.pickupStarted || input.delivery.pickupCompleted) return { kind: 'not_cancellable', code: 'PICKUP_STARTED', confirmedFee: null };
  try {
    const response = await transport({ method: 'PATCH', operation: 'cancel', path: `/order/${encodeURIComponent(input.delivery.woltOrderReferenceId)}/status/cancel`, body: { reason: input.reason } });
    if (!response.ok) {
      if (response.error.nativeCode === 'INVALID_ORDER_STATE_TRANSITION') return { kind: 'not_cancellable', code: 'INVALID_ORDER_STATE_TRANSITION', confirmedFee: null };
      return { kind: 'unknown', code: 'CANCELLATION_NOT_CONFIRMED', confirmedFee: null };
    }
    const parsed = z.object({ status: z.literal('REJECTED') }).safeParse(response.data);
    if (response.status === 200 && parsed.success) return { kind: 'cancelled', confirmedFee: null };
    return { kind: 'unknown', code: 'CANCELLATION_NOT_CONFIRMED', confirmedFee: null };
  } catch { return { kind: 'unknown', code: 'CANCELLATION_NOT_CONFIRMED', confirmedFee: null }; }
}
