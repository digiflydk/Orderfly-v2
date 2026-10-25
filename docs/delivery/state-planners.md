# Pure delivery state planners

Implements the bounded policy foundation of #657.24/.27 against proposed provider-contract-v1. These functions are internal transaction planners, not authorized public services, persistence or dispatch permissions.

`booking/state.ts` validates complete immutable intent binding, compares revision and monotonic local clock, allows submission only from pending, and allows reconciliation results from submitting/unknown. An unknown attempt cannot become pending or submit again. Repeated identical accepted results are inert. Caller must persist submitting before external I/O and treat worker interruption as unknown. Rejection requires definitive evidence of non-creation, never an eventually consistent empty lookup. The planner cannot establish that evidence by itself.

`events/state.ts` checks full provider/order/tenant binding, uses sequence when both exist, otherwise occurrence time, and requests reconciliation for equal-order conflicts, missing established sequence, unsupported reversals, reassignment and terminal conflicts. It permits supported forward jumps because not every provider exposes every intermediate state. It never updates payment/kitchen state. Caller verifies authenticity, resolves the binding and atomically inserts a durable unique event inbox record together with the materialized state. The pure planner alone is not durable deduplication.

No live dispatch integration exists in this slice. Persistence, leases, external worker, cancel/compensation services, quote service, checkout/settlement/print gating and HTTP boundaries remain follow-up tasks. Internal tests: `node --test tests/unit/delivery-booking-state.cjs tests/unit/delivery-event-state.cjs`; project typecheck required. No GitHub Actions or production data mutation.

## Durable storage slice

`booking/server.ts` creates the original attempt at `orders/{orderId}/deliveryAttempts/original` from native `order.managedDelivery` (version, providerId, quoteRef, requestDigest). It requires a Paid Delivery order, matching brand/location, current staff identity and transactional `orderfly.orders:edit` authorization. Concurrent creation returns the same immutable scope-derived reference; changed request digest is rejected. Revisions prevent two submitting claims. Native persistence supplies transition time. This API is server-only, not a server action or public route. It still requires coordinator worker wiring and business eligibility checks before actual external dispatch.

`events/server.ts` accepts a trusted server callback that authenticates a provider message and resolves its native delivery binding to orderId. Verification happens before datastore access. No caller JSON flag establishes authenticity. Within one native transaction it rereads order/managed binding/accepted attempt, inserts a unique per-order inbox row and conditionally updates `deliveryState/current`. Replayed identical event identity with a different reception timestamp is inert; conflicting payload for the same event identity is rejected. Event data is normalized contract data, not raw headers/body/credentials. The callback must be wired only to an actual authenticated adapter. No public endpoint or Wolt authentication is claimed by this slice.

A future retry after a terminal rejected original is a deliberately new business attempt; this service never overwrites original to pretend it is new. Automatic reconciling worker, acceptance gating, cancellation, refunds and complete quote request persistence remain coordinator integration tasks. Inbox retention and authorized support access require operational policy before activation.

Persistence tests: `tests/unit/delivery-booking-server.cjs` and `tests/unit/delivery-event-server.cjs` use an isolated atomic datastore fixture for concurrency, transaction retries, commit rollback, authorization revocation, foreign scope, altered digest, event authentication order, duplicates and conflicting terminal events. These are not live Firestore or Wolt acceptance evidence.

Provider events do not require the current payment status to remain Paid: compensation and delivery states are independent. Events arriving before the accepted attempt is persisted are rejected by this internal service; the adapter must retain/retry or quarantine them durably. No event-loss guarantee is claimed without that adapter inbox integration.

## Deterministic test provider

`providers/test/index.ts` implements the shared provider interface in memory with explicitly supplied synthetic cost and clock. It simulates quote unavailable/expiry, definitive rejection, accepted-create lost response plus reconciliation, stable successful-create identity, mismatched payload rejection and scoped cancellation. It has no real dispatch or tracking link. Constructor refuses production runtime; registry must also register it as test-only. Its state is deliberately not durable and does not prove native provider behavior or worker recovery. Tests: `tests/unit/delivery-test-provider.cjs`.

## Wolt nullable event provenance

ETA-only normalized events (`status: null`) retain all intervals and pickup estimate provenance in the durable inbox without changing fulfillment status. Their action is `ignore` with `eta_only_retained`; this means no status projection, not dropped data. A real status with unknown occurrence time is retained with `missing_occurrence` and requests reconciliation. Transport `dispatchedAt` remains a separate native field and never substitutes for occurrence time. A future estimate projection must compare provider ordering/provenance and must not promote preliminary pickup estimates to verified kitchen/print timing.

## Bounded operational reads

GET `/api/delivery/orders` requires brandId/locationId plus optional cursor, or orderId with optional eventCursor. Native `orderfly.orders:view` authorization and location ownership precede order reads. List scans at most 26 scoped native order records in document-ID order and returns at most 25 managed-delivery rows; filtered empty pages can still have continuation. It does not claim a global count or chronological ordering. Detail checks ownership before nested attempt/state/event reads and returns at most 25 inbox rows per page. Continuations bind the exact scope and detail mode. Economics and tracking URLs are deliberately omitted/null until authorized validated projection exists. Dates/statuses are nullable; no default delivery progress is fabricated. Tests: `tests/unit/delivery-queries.cjs`.
