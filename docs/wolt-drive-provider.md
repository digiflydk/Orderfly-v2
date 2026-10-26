# Wolt provider facade

Issue #695, coordinator #657/#672. `createWoltProvider` implements the actual shared `DeliveryProvider` interface accepted at commit `04f9a512247ae03be0b855ef36ab753e57203c10`, contract blob `d2da8a2ec58375463aaa8b39957b5d95b6c3cab2`.

The facade composes server-authorized bindings and credential resolution with the native HTTP, quote, create and cancellation adapters. It advertises no lookup, provider idempotency, ready-for-pickup or cancellation-price preview. Reconciliation returns unsupported so the shared coordinator must retain unknown attempts for verified events or manual resolution.

## Injected persistence and dispatch contract

The shared coordinator supplies `authorizeScope`, `resolveBinding`, `saveQuote`, `loadQuote`, `validateClaimedAttempt` and `loadCancellation`. These are server functions, never browser callbacks. No new database collection/migration or worker is created here.

Map the authorized shared binding's `scope`, `providerId`, numeric `revision`, `merchantRef` and `venueRef` into the Wolt binding envelope (`brandId`, `locationId`, `provider: 'wolt'`, string revision, `merchantId`, `venueId`). Preserve active/environment/secretRef and validate current authorization first. Never infer an active merchant binding solely from delivery settings `providerId`.

Persist private quote snapshots immutably and scope their reads by brand/location plus quote reference. The snapshot contains provider-normalized address/coordinates, native promise, fetched/expiry times, binding revision/environment, provider cost and a hash of the complete validated fulfillment request. The shared quote service remains responsible for authoritative cart/economics fingerprint and customer fee acceptance. The facade rechecks its own fulfillment fingerprint, scoped binding revision, provider cost and bounded freshness before sending. It does not overwrite shared customer economics.

The shared dispatcher MUST claim and durably transition the original intent to submitting before calling `create`, only once. `validateClaimedAttempt` verifies that exact scope/order/quote/requestDigest/attempt linkage. It must return false for an unclaimed or replayed dispatch. It must not create another intent or permit another send after a lost response/crash. This facade does not implement a second booking state machine. Any uncertainty is returned as unknown with reconciliation required; native writes are not automatically retried.

After awaited dispatch-claim verification and cancellation lookup, the facade reauthorizes and rereads the active binding. Revision, merchant, venue, environment and secret reference must still match the credential context resolved earlier. Revocation or rotation during those operations prevents an HTTP request with the earlier credentials. This is a last preflight check, not a distributed lock over the external Wolt request.

`loadCancellation` supplies the authenticated original attempt's provider delivery ID, Wolt order reference, account/environment and observed pickup flags. A caller cannot choose another delivery through its request. The shared contract's validated `operatorReason` is forwarded; fee previews and late-cancellation agreements remain unsupported. The cancellation provider call still handles a pickup race conservatively.

## Result semantics

Only a point scheduled-delivery interval is supported. Unsupported requirements and impossible native recipient/parcel bounds are rejected before quoting. Returned native quote data must also pass the create payload preflight before an available quote is offered or saved. In particular, a combined unit/instructions comment over 500 characters, parcel count over 100, oversized returned address or invalid promise ID cannot become a bookable quote. Create repeats local preflight and returns definitive rejection on local payload failure, without sending a provider request. Native pickup estimates from quote/create are explicitly preliminary. Reliable kitchen/print time requires verified webhook evidence, handled separately. Provider tax basis is inclusive, tax amount remains unknown, and missing route distance/fees are not invented.

## Validation and remaining integration

Internal fixture tests execute actual adapters and shared schemas: quote/create/cancel mapping, denied tenant access, changed address/price/revision/foreign snapshot, claim failure, quote expiry during awaited validation, lost create response with one send, unsupported features, and foreign cancellation. Run `node --test tests/unit/wolt-provider.cjs` and typecheck with the accepted shared contract and reviewed native adapter dependencies present.

This PR depends on configuration #697, quote/transport #700, booking #702 and the shared contract above. During development the exact accepted shared-contract blob was copied as an untracked test overlay; it is not authored or published by this lane. Typecheck evidence on that assembled tree is integration evidence, not a claim that facade-only main compiles before dependency merges. Concrete production repository wiring, registered provider, sandbox callback lifecycle and browser/live acceptance are still owned by the shared coordinator. This file does not enable dispatch.
