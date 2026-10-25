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
  eta: string | null; eventOccurredAt: string | null }) {
  const instant = (value: string | null) => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  const reliable = input.source === 'verified_pickup_eta_update' && instant(input.eta) && instant(input.eventOccurredAt);
  return { reliableForKitchenTiming: reliable, pickupEta: reliable ? input.eta : null,
    reason: reliable ? 'optimized_event' as const : 'awaiting_optimized_event' as const };
}
