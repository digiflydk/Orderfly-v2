# Managed courier cancellation

`POST /api/delivery/cancel` accepts exact scoped order ID, UUID request ID and bounded operator reason. It requires existing verified operator identity, current native location ownership and `orderfly.orders:edit`. Same-origin bounded JSON and no-store responses follow existing administration conventions. Customer receipt proof is not cancellation authority.

A separate default-off `ORDERFLY_DELIVERY_CANCELLATION_ENABLED=true` gate controls cancellation. Production also requires `ORDERFLY_DELIVERY_PRODUCTION_ENABLED=true`; disabling creation does not inherently prevent cancelling an existing courier. No setting is activated by this change.

The original booked attempt, immutable accepted result, stored original dispatch environment/account/venue/revision and active binding are reread. Cancellation is limited to delivery before pickup. Unknown or foreign status/identity is rejected; no caller-supplied provider reference is trusted.

`orders/{id}/deliveryCancellation/original` records an immutable command fingerprint, actor and claim before external I/O. Its requested audit is atomic. The facade loadCancellation hook revalidates native identity/state and consumes the one-shot network claim atomically. Database retries contain no provider calls. Duplicate or new requests return existing evidence; the same request ID with changed payload is rejected. A timeout or crash never triggers automatic redispatch. Unfinished submitting state requires reconciliation.

Wolt confirmation is the adapter's verified HTTP200 REJECTED response. Result and audit persist even if operator permission changes after dispatch; this records observed evidence and cannot authorize another request. Conflicting pickup/delivery evidence leaves the cancellation in unknown/reconciliation state. Errors returned to clients are sanitized.

Courier cancellation is separate from order cancellation and customer refund. No payment status, accounting, kitchen state, booking rejection or refund job is fabricated. Provider fee null means unknown, never zero. UI must explain this before confirmation. Native callback can independently update delivery lifecycle. The cancellation evidence itself is retained even when a callback is delayed.

`cancellationAvailability` is a read-only UI hint reusing canonical checks. Mutation repeats checks independently. Tests use isolated native policy/data and mocked provider I/O, covering concurrent/double clicks, unknown outcome, changed payload, authority loss, environment gates, pickup rejection and no refund side effects. No live provider cancel or production data mutation was performed.

Wolt cancellation closes as soon as verified `order.pickup_started` maps to `courier_to_pickup` (including pickup arrival), before physical food collection. Both availability and the final pre-network claim check use this cutoff; the UI must not offer cancellation once this state is known.
