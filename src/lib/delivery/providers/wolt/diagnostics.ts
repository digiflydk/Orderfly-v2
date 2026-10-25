import 'server-only';
import { createHash } from 'node:crypto';

const CODES = ['AUTHENTICATION_FAILED', 'WEBHOOK_REJECTED', 'BOOKING_UNKNOWN', 'NOT_DELIVERED',
  'CANCELLATION_REJECTED', 'SERVICE_UNAVAILABLE', 'NONE'] as const;
export type WoltDiagnosticCode = typeof CODES[number];

/** Call only after scope authorization. Arbitrary errors and provider payloads are never logged. */
export function woltDiagnostic(input: {
  code: WoltDiagnosticCode; quoteRef?: string; attemptRef?: string; providerDeliveryId?: string;
  nativeCode?: unknown;
}) {
  const code = CODES.includes(input.code) ? input.code : 'SERVICE_UNAVAILABLE';
  const fingerprint = (value?: string) => typeof value === 'string' && value.length > 0 && value.length <= 1024
    ? createHash('sha256').update(value).digest('hex').slice(0, 24) : null;
  return { provider: 'wolt' as const, code,
    quoteFingerprint: fingerprint(input.quoteRef), attemptFingerprint: fingerprint(input.attemptRef),
    deliveryFingerprint: fingerprint(input.providerDeliveryId),
    // Native strings may contain personal data. Only known non-personal codes are retained.
    nativeCode: typeof input.nativeCode === 'string' && ['DUPLICATE_ORDER', 'UNAUTHORIZED', 'FORBIDDEN'].includes(input.nativeCode) ? input.nativeCode : null,
    requiresReconciliation: code === 'BOOKING_UNKNOWN',
    operatorAction: code === 'BOOKING_UNKNOWN' ? 'reconcile_before_retry' : code === 'AUTHENTICATION_FAILED'
      ? 'verify_server_configuration' : code === 'NOT_DELIVERED' || code === 'CANCELLATION_REJECTED'
        ? 'review_delivery_with_support' : code === 'WEBHOOK_REJECTED' ? 'inspect_verification_and_inbox' : 'inspect_status',
  };
}

/** Input must come from verified, durably accepted, ordered webhook state, never request bodies. */
export function woltPickupEtaReliability(input: { source: 'initial_response' | 'verified_pickup_eta_update';
  eta: string | null; eventDispatchedAt: string | null }) {
  const instant = (value: string | null) => {
    if (typeof value !== 'string') return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!m) return false;
    const [, y, month, day, hour, minute, second, zone, , zh, zm] = m;
    const days = new Date(Date.UTC(Number(y), Number(month), 0)).getUTCDate();
    return Number(y) >= 2000 && Number(y) <= 2100 && Number(month) >= 1 && Number(month) <= 12 &&
      Number(day) >= 1 && Number(day) <= days && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60 &&
      (zone === 'Z' || (Number(zh) <= 14 && Number(zm) < 60 && (Number(zh) < 14 || Number(zm) === 0))) && Number.isFinite(Date.parse(value));
  };
  // Wolt supplies dispatch time, not an event-occurrence timestamp. Never invent the latter.
  const reliable = input.source === 'verified_pickup_eta_update' && instant(input.eta) && instant(input.eventDispatchedAt);
  return { reliableForKitchenTiming: reliable, pickupEta: reliable ? input.eta : null,
    reason: reliable ? 'optimized_event' as const : 'awaiting_optimized_event' as const };
}
