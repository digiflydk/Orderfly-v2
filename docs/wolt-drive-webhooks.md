# Wolt Drive webhook adapter

Issues: #684, #685, #686; release coordination: #657 / #672.

This server-only adapter provides a framework-neutral HTTP handler. It is not an installed public route and does not provide a second persistence implementation. The delivery coordinator must supply the real scoped callback resolver, attempt resolver and transactional inbox before enabling reception.

## Verified native protocol

Official source reviewed 2026-10-26: https://developer.wolt.com/docs/wolt-drive/webhooks . This is Drive's JSON `token` envelope containing an HS256 JWT, not Marketplace's `WOLT-SIGNATURE` protocol. The callback secret is separate from the merchant API credential and must be selected from a server-owned opaque callback binding, never from unverified payload claims.

The handler bounds streamed input at 64 KiB, accepts POST JSON only, verifies a canonical compact JWT and timing-safe SHA-256 HMAC, and validates claims and relevant event fields before resolving an attempt. Optional native fields are tolerated but stripped from the normalized event. JWT `exp` and `nbf`, when supplied, are enforced. No invented maximum event age rejects legitimate provider retries; the durable inbox handles replay.

The published schema calls `details.id` an event ID. Dedupe hashes merchant, native order reference, type and event ID; replay of the same receipt is stable, while an ID reused across lifecycle types does not erase a different transition. Actual sandbox evidence must confirm native ID behavior before activation. `dispatched_at` is dispatch time, not occurrence time; `occurredAt` stays null. Preserve dispatch and receipt timestamps separately. There are no native sequence numbers here.

## Identity and shared inbox

`details.wolt_order_reference_id` resolves an existing attempt within the verified merchant. The resolver returns the stored delivery response ID, brand, location and venue. These identities must not be confused with the event ID. A supplied venue must match. Special location/handshake events lack venue in the documented examples, so the stored merchant/order relationship establishes scope. Customer-supplied merchant reference alone must never establish ownership.

`appendVerifiedEvent` must atomically recheck current binding and attempt ownership, persist unique receipt, and apply only permitted transitions. Its promise resolves only after durable commit. Failures return 503; a missing attempt also returns 503 because webhook delivery can race create-response persistence. Duplicate receipt returns 200 after the inbox confirms it. The handler neither prints, refunds, nor changes financial/kitchen state. Out-of-order, replay and conflicting terminal-state correctness must additionally be tested against the actual shared datastore, not inferred from the unit fixture.

## Event behavior

Received maps to booked; pickup-started/arrival to courier-to-pickup; picked-up/dropoff-started/arrival to picked-up; delivered to delivered. Rejected, not-delivered and customer-no-show map to failed. No courier-assigned or cancellation event is invented. Dropoff-completed alone requests reconciliation and does not declare final delivery completion. Same-action events may arrive in either order.

Pickup/dropoff ETA events update estimates without inventing lifecycle progress. Pickup reliability changes to true only on pickup-ETA-updated; other events return null (no reliability change). Shared storage must preserve a prior true flag, not overwrite it from an older event. Unknown, courier-location and handshake events keep safe identity/status metadata without changing fulfillment or retaining courier coordinates/PINs.

## Validation and remaining acceptance

`node --test tests/unit/wolt-webhooks.cjs` exercises actual production adapter code with synthetic signatures and injected inbox I/O. Covers forged signatures, algorithms, claims, body bounds, malformed ETA, native mapping, identity, tenant rejection, duplicate requests, await-before-ack and storage failure. No real Wolt event was received in these tests.

Before rollout: install a route with actual transactional inbox; test persisted replay/out-of-order/terminal conflicts and revocation; register a sandbox-only callback with a distinct random secret; receive genuine sandbox events; independent exact-head review; serial release and deployed SHA/live QA through #657. No webhook registration, production secrets or provider writes are performed by this change.
