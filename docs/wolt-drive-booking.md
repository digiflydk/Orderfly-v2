# Wolt delivery creation and cancellation

Scope: #681, #682, #683 under #672/#657. Provider-only helpers; no checkout, payment, kitchen, printing or database implementation changes.

`createWoltDelivery` accepts a server-resolved binding and immutable quote. It validates matching brand/location/venue, a binding promise, provider expiry when supplied and a maximum local age of five minutes. Recipient coordinates/address come from Wolt's quoted dropoff location. The request carries the same durable attempt reference on every reconciliation path. Parcel price is declared goods value, never the customer delivery charge. Cash, tips, alcohol/ID restrictions and handshake delivery are not enabled by this slice; unsupported flags fail validation rather than silently dispatching an unsuitable order.

A 201 response must validate before being accepted. Both `id` (delivery identity) and `wolt_order_reference_id` (native identity for cancellation and webhook lookup) are retained. An invalid success response, lost response or `DUPLICATE_ORDER` remains unknown. No general delivery/reference lookup endpoint is assumed. Recovery requires verified webhook evidence or operator resolution. Tracking must use HTTPS without embedded credentials. Missing ETA remains unknown. Provider prices use Wolt’s documented VAT-inclusive basis; the tax amount/rate is not invented. Initial create ETA must be displayed as preliminary according to the facade policy.

`bookWoltDelivery` is an optional wrapper around the **shared coordinator-owned repository**, not a second state machine. The repository must atomically reserve an intent before I/O, return dispatch permission to one caller only, freeze the validated request before awaiting storage, reject altered payload digests, and retain the claim through crashes. Repeated unresolved calls do not dispatch. Failed result persistence returns unknown; it never clears the reservation. If the common orchestrator already owns the reservation, call `createWoltDelivery` directly instead of claiming twice. Production integration must prove the actual repository semantics; the included tests use an isolated atomic fixture and do not establish Firestore correctness.

Cancellation resolves the native ID from authorized scoped storage. Known pickup start/completion disables automatic cancellation. A racing `INVALID_ORDER_STATE_TRANSITION` returns not-cancellable; only HTTP 200 with native `REJECTED` confirms cancellation. Transport failures, 202 and unexpected payloads remain unknown. Late cancellation stays disabled pending the specific Wolt agreement and fee acceptance policy. Fees are null when Wolt does not provide them. This adapter never issues a payment refund.

Internal verification: `node --test tests/unit/wolt-booking.cjs` and `npm run typecheck`. Fixture tests cover payload mapping, foreign scope, expiry, unsupported flags, malformed/lost/duplicate outcomes, concurrent dispatch, changed payloads, failed persistence, native identity and cancellation races. No GitHub Actions, live courier booking or production-data mutation is part of these tests.

Official sources checked 2026-10-26:
- https://developer.wolt.com/docs/wolt-drive/endpoints (venueful Deliveries and Order cancellation)
- https://developer.wolt.com/docs/wolt-drive/error-handling (DUPLICATE_ORDER)
- https://developer.wolt.com/docs/wolt-drive (cancellation timing and late cancellation agreement)
