# Explicit receipt reprint delivery

The Live CloudPRNT URL carries both automatic originals and explicit manual receipt requests. Manual kitchen/customer requests are separate immutable `manualPrintRequests` documents; they never reuse an original job ID, modify `originalPrintHistory`, or replay the order-payment transition. A request can print a historical customer receipt without asserting that the order is currently eligible for kitchen production.

The existing `ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED` deployment gate remains required. Manual requests do not require an active 60-minute automatic-purchase window: their explicit authorized creation is the output intent. Every device operation revalidates native credentials, active printer state, scoped ownership and printer/credential revisions. A configuration or credential change invalidates pending manual delivery.

## Shared transport ownership

Enqueue reads the ordinary pointer and creates `manualState/current` transactionally. Automatic offering reads the manual pointer before its own writes. Manual offering reads both pointers. This makes concurrent enqueue/automatic offering conflict and retry rather than offer two jobs to the same physical device. A busy/paper-out/printing poll never receives a new manual job.

Manual payload bytes are frozen before enqueue, bounded, hashed and validated again before offering and returning bytes. Tokens are random 32-byte values; only a scope-namespaced SHA-256 token index is persisted. A scoped manual token index selects the manual lane for GET/DELETE. Only absence permits ordinary lookup; malformed/manual-owned indexes fail closed.

## Lifecycle and ambiguity

- Queued requests expire after ten minutes.
- An offer has at most sixty seconds, also bounded by the request expiration.
- GET commits `download_started` before returning PNG bytes. Repeated GET is refused, including when the first HTTP response was lost.
- Only an explicit successful device acknowledgement marks `confirmed` and removes the manual transport pointer. Duplicate acknowledgement is idempotent and cannot clear a newer pointer.
- Failure or an unclear acknowledgement remains failed/unknown; no automatic retry occurs.
- Queued or offered requests which never transferred can expire and release the pointer. A transferred job with a lost acknowledgement becomes unknown and retains its pointer for investigation; time alone never silently reprints it.

The user-facing confirmed state means the printer acknowledged the transfer/print. Physical legibility still requires checking the paper. No test in this slice sends production output.

## Local verification

`node --test tests/unit/printing-manual-native.cjs tests/unit/printing-ordinary-native.cjs`

Coverage includes manual output without an automatic window, shared occupancy, paper/busy behavior, wrong scope/revision, credential revocation, corrupt content, repeated GET, duplicate/old ACK, transaction rollback/retry, failure/timeout ambiguity and actual HTTP negotiation. Existing original lifecycle tests ensure the new lane does not rewrite original identities or histories.
