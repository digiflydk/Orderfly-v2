# Customer quote boundary and authoritative routing

## Runtime decision (2026-10-26)

Source configuration names, delivery documentation and available runtime environment names contain no approved Maps/Geocoding/Routes binding. No secret values were read. `resolveManagedDeliveryRuntime` now supports explicitly approved scoped configuration but returns null when that configuration or its gates are absent. An independent adoption marker preserves legacy delivery until scoped activation. Optional Google code is installed but inactive. This is not evidence that the operator has no external account.

To activate: approve an authoritative route provider, billing project/cost ceiling, credential restrictions, retention/attribution and permitted verification calls; supply verified pickup contact and assemble the scoped Wolt quote provider. Native Brand/Location types contain no pickup phone, so none is invented. Dispatcher/payment acceptance remains separately required. No API, secret, collection TTL, index or production data was changed.

## End-to-end implemented path, fixture exercised

`requestManagedDeliveryQuoteAction` validates bounded input while allowing actual unchecked purchase terms. It uses the same private native pricing resolver as final checkout: active scoped products/combos/options/upsells, automatic/manual promotions, club/newsletter eligibility and authenticated discount cards. Client totals are proposals that must validate, never price authority. New managed minimum uses item subtotal after discounts; legacy minimum remains unchanged. Eligible native free-delivery campaigns use after-discount subtotal and still obey distance and subsidy/customer caps. Campaign identity is included in the authoritative digest.

The native controller verifies brand/location/currency, loads effective delivery configuration and normalizes Danish textual street/building/unit. Ambiguous or unsupported-country addresses fail; no guessed coordinates. Ready time comes from native pickup availability; separate delivery schedule and provider coverage remain required. Scheduled delivery preserves the customer arrival target separately from its planned courier pickup and nullable provider ETA.

Server-created drafts live under `deliveryCheckoutDrafts/{checkoutKeyHash}` with incrementing revisions, authoritative digest and ten-minute expiry. Digests bind both addresses, contacts, native cart/prices/fees/promotion result, timing selection and configuration revisions. Quote issuance stores the server snapshot, reserves its independent rate budget, geocodes/routes via server dependencies and obtains provider quote. Before publishing, a native transaction rereads draft revisions/digest, active tenant/location and settings. A later quote invalidates earlier draft revisions.

Claims use canonical `deliveryQuotes/{quoteRef}` plus `customerClaims/current`, with only a domain-separated hash of a fresh 256-bit token. Public DTO reveals customer fee/total/ETA/expiry, not supplier costs or credentials. Before final payment, the checkout action redoes native catalog/discount pricing and compares authoritative draft content, token, exact fee-inclusive total and currency. The same verified Stripe client/account returned by the managed payment-authority module creates the session; its account/livemode is saved on the order.

The order-creation transaction rereads the native quote, claim, current server draft and settings, then atomically consumes the token alongside the Pending order. Replays cannot fund a second order. Managed order metadata binds provider, quote reference and full quote content digest. The paid-order worker owns later provider dispatch. Zero-total or pay-at-pickup managed orders are rejected because the managed authority requires a positive verified online payment.

The checkout requests a quote automatically after valid required input and displays its authoritative fee-inclusive total. Customer acceptance is the normal payment action on that displayed current quote, not a separate quote checkbox. Automatic retrieval is not payment authorization. Input changes invalidate the prior client proof; all native claim, revision, token and amount checks described above still apply.

Quote expiry is checked again before opening Stripe. A quote accepted into a pending order is not a guarantee that its provider price remains available after payment; the paid orchestration must revalidate/reconcile and compensate according to the documented policy. An already-consumed token cannot be retried as a different order if later checkout creation fails; obtain a fresh quote.

## Rate/privacy and remaining external gates

`deliveryQuoteRateLimits` commits budget before provider calls: six requests per hashed checkout capability/minute and thirty across the current global managed-delivery scope/minute. The second guard deliberately uses a global hash, not client IP headers, until trusted edge identity is configured. Both counters expire after two windows; enable managed TTL cleanup separately before activation. Fixed windows permit boundary bursts. This protects external-call budget; earlier catalog reads still require normal platform abuse controls.

Server drafts and claims store no raw checkout capability or quote token. Customer records and address inputs are private, not logs. Configure server-only Firestore access and retention/TTL for the new transient metadata before launch. Native financial snapshot retention is separate from any third-party route content policy.

## Validation

Internal native tests exercise successful quote action through real server pricing/controller/store, exact managed amount, account binding and atomic claim/order creation using mocked network/datastore only; changed catalog, tampered total and requote invalidation reject before payment. Separate tests cover token digest/revision/expiry, native transaction rollback/replay, rate reservations and quote-vs-purchase legal terms. Existing checkout regressions cover legacy behavior. TypeScript check required. No Actions, paid provider requests or production mutation.

Managed delivery defaults to `scheduleMode: restaurant`, including old records without a mode. The scoped settings loader derives courier pickup windows from the location's current `openingHours`, applying `pickupOpeningOffsetMinutes` and `pickupClosingOffsetMinutes` (both default 20). For 11–22, courier pickup is allowed from 11:20 through 21:40 inclusive. The admin can select `manual` to use the independent weekly rows, or return to restaurant inheritance. Enabled/paused flags and date exceptions remain authoritative. Overnight windows split across weekdays and Copenhagen DST conversion remains shared with native slot generation. No production settings migration is needed or performed.

Customer arrival slots add the 30-minute transport estimate to eligible native pickup slots, so the last default arrival can be 22:10. Scheduled `fulfillment.readyAt` and order `fulfillmentAt` retain the selected pickup instant; `fulfillment.desiredDelivery` and `expectedDeliveryAt` retain the separate customer arrival target. Actual route feasibility and provider pickup estimates are checked without adding preparation twice. Quote persistence, Wolt authority and dispatch recheck the bound pickup against current effective settings; the final native draft digest also covers location hours and the derived schedule. Nullable provider estimates remain null rather than being presented as confirmed times. Delivery instructions remain bound to the request digest.

Customer quotes now use a maximum five-minute local lifetime bounded by native provider expiry. A missing native expiry does not yield a customer quote. At least 60 seconds must remain before committing checkout/preparing hosted Stripe. Payment may still outlive the immutable quote: the paid dispatcher must reject expired evidence and follow the refund path rather than refresh silently.

Configured runtime (all absent/off by default): `ORDERFLY_DELIVERY_CHECKOUT_ENABLED=true`, `ORDERFLY_DELIVERY_ROUTING_ENABLED=true`, the dispatch enable gate, `ORDERFLY_DELIVERY_ENVIRONMENT=sandbox|production`, and separate `ORDERFLY_DELIVERY_PRODUCTION_ENABLED=true` for production. The optional Google source additionally requires `ORDERFLY_DELIVERY_GOOGLE_RETENTION_APPROVED=true` and server-only `ORDERFLY_DELIVERY_GOOGLE_MAPS_API_KEY`. No setting is enabled by code installation.

The server-only document `deliveryRuntimeConfigs/{sha256(JSON.stringify([brandId,locationId]))}` must match exact `scope` and `environment`, contain `routingSource:'google_maps'`, nonempty `routingApprovalRef`/`retentionApprovalRef`, and a verified `pickupContact:{name,phone,verifiedAt}` with E.164 phone. These references record separate approvals; their presence does not establish that any approval has been granted in this project. Before setting them, assess storage of coordinates, route meters/provenance and immutable quote/provider records against the applicable Google terms, attribution, retention and deletion obligations. The current permanent quote envelope must not receive Google restricted data until that assessment explicitly permits its actual storage design. A key alone is insufficient. No configuration records, flags or secrets were created by this change.

`managedDeliveryRuntimeAvailable(scope)` performs only gated configuration reads. Runtime construction after native draft persistence creates the optional routing adapter without a request and obtains the narrow Wolt customer quote authority for that exact saved draft. All actual route/provider requests occur only during quote issuance. Provider create/cancel are unavailable in this customer quote factory.

Quote latency: the customer quote action no longer adds a third availability probe. The controller still verifies adoption, exact scope/environment, approvals, enrollment and verified pickup identity before saving any customer draft, and the authoritative runtime resolver repeats these checks after draft persistence before constructing adapters. Routing configuration/secret initialization and the saved-draft provider capability initialize concurrently; both must succeed before use. No configuration or credential cache is introduced, and provider operations retain their native transactional authority and binding rechecks.

Further bounded latency reduction overlaps independent adoption/configuration reads, routing-approval/enrollment reads, native settings/environment reads, and brand/location settings reads within the same transaction. Both results must still validate before use; no approval, retention, scope, environment or revision guard is removed. Secret Manager SDK clients reuse transport/authentication plumbing between requests. Secret values and authorization decisions are not cached: every secret operation still calls `accessSecretVersion` for its pinned reference, propagates IAM rejection, and retains before/after native binding checks. Gated tests verify read overlap and revocation behavior; no live response-time improvement is claimed without a separate production measurement.

The binding customer quote still requires complete contact information as well as a valid address. Customer identity affects newsletter/club pricing, contact/consent fields enter the immutable draft digest, and Wolt requires recipient details. An address-only estimate would need a separate non-binding contract; placeholder contacts or a relaxed payment-proof schema are not used. Existing persisted quote diagnostics record only failure stage/code/timestamp and cannot establish successful quote duration.

Request-local quote profiling now measures fixed named stages with `AsyncLocalStorage`. The response may contain only `serverMs` and allow-listed stage `{ms,count}` aggregates; no inputs, result payloads, exception messages, IDs, addresses, secret references or credentials enter the recorder. Nested and concurrent totals overlap and must not be summed as end-to-end duration. `serverMs` covers the server action and the browser can separately measure its request duration. Stages distinguish native scope/pricing/configuration/draft/runtime/claim, routing/geocoding/budget/HTTP, and Wolt authority/secret/HTTP/private-quote storage. Timings do not alter financial proof or availability decisions. The initial instrumentation release deliberately retains the existing authorization transaction count to obtain a genuine baseline before further optimization.

The subsequent read-only transaction change keeps every authorization invocation and before/after secret check. Native Wolt authority snapshots, adoption lookup, internal platform configuration loads, and draft settings reads explicitly request Firestore `{readOnly:true}`. These functions contain no writes; the SDK can avoid read locks and the empty commit performed by a default read/write transaction. Snapshots still validate exact scope, enrollment, draft, settings revisions and provider binding. No explicit stale `readTime`, cache, or authorization shortcut is introduced. Draft persistence, quotas, private quote storage, claim creation/consumption, settings writes and audits remain read/write transactions. Tests enforce transaction options and reject any attempted write through a read-only fixture while retaining revocation and post-secret binding-change tests. Live stage durations must establish any production improvement; the number of authority checks is intentionally unchanged.

Pickup and dropoff geocoding run concurrently, then routing waits for both verified results. Geoapify preserves invocation identity rather than completion order, so a faster destination response cannot swap the route endpoints. Each request still requires its own valid durable budget grant, the per-quote reservation remains shared once, and all address/confidence/retention/timeout checks remain intact. Gate-based tests prove overlap and reverse completion rather than relying on unstable wall-clock performance thresholds. These remove known sequential work; they do not establish a measured production latency guarantee.

Native pickup and delivery slots represent customer fulfillment times. Their earliest time includes preparation (and transport for delivery) once; the latest fulfillment time is the location closing time, inclusive when it falls on the five-minute grid. The same boundary applies to future preorders and overnight opening periods. For example, Friday at 20:25 with 20 minutes preparation and 30 minutes transport can offer 21:15 delivery when the location closes at 22:00. Independent managed delivery hours, exceptions, route feasibility and provider checks still apply; this does not extend those schedules. Regression coverage in `tests/unit/time-slots-closing.cjs` includes closing boundaries, insufficient lead time, short preorder windows, overnight dates and both DST transitions.

Managed customer time selection uses a 30-minute transport estimate plus the effective kitchen preparation policy. Native quote and final payment slot validation use that same managed transport baseline; legacy and pickup validation retain the location's existing policy. Real route feasibility and provider timing remain authoritative, and preparation is never added again to a provider delivery ETA.

Adoption uses the separate server-owned `deliveryAdoptions/{sha256(JSON.stringify([brandId,locationId]))}` document, strictly `{version:1,brandId,locationId,mode:'managed'}`. Selecting a provider or preparing settings does not adopt a location. An absent marker preserves legacy delivery; a valid marker requires managed checkout even during runtime outages. Malformed, mismatched or unreadable markers fail checkout closed and cannot enable the runtime. Runtime configuration also requires a valid adopted marker. Only a scoped authorized launch creates this marker; removing it is a deliberate rollback decision, independently of provider/configuration changes. No marker writer or production mutation is included. Pickup remains independent. Delivery instructions follow receipt text validation: multiline LF and TAB are accepted, unsupported control/format/surrogate characters are rejected before canonical whitespace trimming.

Managed checkout requires an explicit native environment and Stripe authority with `livemode === (environment === 'production')` before pending order creation, quote consumption or hosted session creation. Sandbox+live, production+test and missing/unknown modes fail closed. The native environment is also included in the authoritative cart digest, so an environment change invalidates an issued customer quote at final revalidation. Historical account verification and refund paths are unchanged.

Kitchen preparation uses the greater of canonical delivery `preparationMinutes` and the native preparation policy (positive manual override, otherwise native prep plus busy-level addition). The effective duration is applied once to real opening-hour/DST slot calculation and included with native kitchen hours in the authoritative digest. Final checkout rederives that policy but preserves the quote's original readiness instant; a changed duration or hours invalidates acceptance. ASAP is unavailable while the native kitchen is closed or its ready pickup falls outside the effective pickup schedule; the customer must select an explicit future delivery time. Scheduled fulfillment retains its actual future `readyAt` and carries the effective `preparationMinutes` separately for Wolt's bounded preparation duration, without treating the wait until opening as preparation or replacing the order's requested delivery target.


### Optional email-benefit lookup and the client action queue

The personal discount-card preview clears the previous contact's offer immediately when email or scope changes. It only calls its existing authenticated server action after a valid, trimmed email has been stable for 300 ms. At most one preview request runs at a time; effects waiting behind it recheck their identity before sending, so intermediate addresses never enter Next's action queue. Focus refresh remains supported and coalesces repeated focus events. Late results cannot restore another contact's benefit. This changes optional preview scheduling only; quote proof invalidation and authoritative pricing/payment validation remain unchanged.

### Address-first customer price

`POST /api/delivery/price-preview` accepts only scoped address fields, with a same-origin JSON boundary and a 4 KB limit. It resolves the approved routing adapter without constructing Wolt or creating a customer draft. The response exposes the configured distance tariff, minimum and free-delivery threshold, never a quote token or payment capability. This lets checkout display distance pricing before contact details or courier confirmation. Existing full pricing, supplier/subsidy checks, immutable quote and payment validation remain authoritative. Any supplier-driven fee change is explicitly announced before payment.

The browser binds preview results to the exact scope/address, drops stale responses, debounces typing and times out preview requests. Contact/cart changes reuse the route preview but invalidate final quote authority. Wolt confirmation starts after preview completion; failure of preview falls back to the existing quote flow. Route evidence is reused for up to 30 seconds in bounded process memory (256 entries), keyed by tenant, location, approved source and both exact addresses. Runtime approval and current settings are still loaded for each request; the cache does not grant authorization or extend evidence freshness. No external route response is accepted from the browser. Customer pricing visibility and payment readiness are separate states.

## Confirmation performance after tariff preview (2026-10-31)

The measured baseline on `af848f4372d557262702f814a27bc089b30ff7dc` is
19,484 / 19,772 ms server time. It includes seven repeated Wolt authority
transactions (9,143 / 9,309 ms), whereas shipment-promises HTTP takes only
467 / 584 ms. These nested totals must not be added to server time.

The customer facade now mints a server-only WeakMap capability and constructs
its storage immediately before the single provider quote, after routing.
Storage performs one native preflight transaction and reuses its immutable
binding for scope/binding/secret resolution within that invocation, bounded to
30 seconds. No browser flag or deserialized capability can select this mode.
The facade is single-use and removes its capability on success or failure.
Operator, dispatch, cancellation and reconciliation authority is unchanged.
Secret payloads are not cached.

The final private-quote write still freshly validates native enrollment, draft
contents/revisions/expiry, tenant/location activity, unchanged runtime configuration and managed adoption,
effective delivery settings,
pickup schedule and exact Wolt binding/merchant registry. The complete binding
must match the preflight snapshot, including the secret version. Transaction
retries repeat these fresh reads. Independent reads execute concurrently;
restaurant schedule resolution reuses only a location snapshot from that same
transaction. Claim persistence and payment consumption retain fresh restaurant,
settings, draft, expiry and proof checks. Pricing/subsidy/campaign rules are
unchanged. No actual courier dispatch is added.

### Restaurant data

The public brand and location DTOs used for initial pricing are cached with
Next's existing cache infrastructure: key `delivery-restaurant-v1` plus both
native IDs, 60-second revalidation, tag `storefront`, cloned returns. Native
brand/location administration already invalidates that tag after a commit.
A server-computed fingerprint of the same allow-listed public records is saved
in new drafts and included in their request digest. Fresh preflight, quote-save
and claim/payment checks reject changed records and invalidate the tag. Thus an
instance which has not observed invalidation cannot accept a stale quote.
Final payment preparation still loads current restaurant data. Customer data,
checkout approvals, provider bindings and secrets never enter this shared cache.
Effective delivery settings/revisions remain freshly read in final transactions.

Runtime approval/config and Geoapify readiness reads can be reused inside the
same AsyncLocalStorage request only. Their keys include restaurant scope where
applicable. Geoapify's post-secret check remains fresh. Final transaction
validators bypass this request cache entirely.

### Route reuse

The original 256-entry/30-second Map is module/process local. An isolated-module
regression reproduces a miss for identical scope, source, addresses and profile.
The historical two misses did not log process identity, so they cannot be
attributed conclusively to instance separation versus expiry. No retrospective
claim that their exact cause was proven is made.

Preview now also returns a route-only receipt. The active routing adapter uses
a domain-separated HMAC derived server-side from its active routing credential;
no credential is sent to the client. The authenticated payload binds both
restaurant IDs, provider source, both complete normalized postal addresses,
profile, immutable coordinates/route evidence and issuance time. It expires
at 30 seconds, never slides on read, and has an 8 KiB input bound. Credential
rotation invalidates existing receipts. It contains no contact/cart data and
is not a quote/payment capability. It creates no new database retention or
secret-provisioning requirement. The confirmation resolves its authorized
runtime and verifies the receipt before using it across instances. Missing,
invalid, foreign or expired receipts fall back to server geocoding/routing and
its existing budget controls. All price/coverage/availability checks still run.

Metrics distinguish `route_receipt_hit`, `route_cache_hit` and
`route_cache_miss`; only one is expected per route resolution. The `routing`
span includes verification or fallback. `wolt_authority` now measures the one
preflight, while final fresh authorization is included in `wolt_store`.
Browser timing diagnostics are JSON strings with numbers only.

### Validation and release

Internal regression covers native pricing/payment, old quote revocation,
changed restaurant/cart/address/time/settings/binding during Wolt I/O,
deactivation, expired drafts, provider failure/timeout, isolated-instance
route receipt reuse, forged/foreign/expired receipts and restaurant cache
invalidation. The customer factory itself no longer performs database I/O;
missing/expired/foreign drafts still fail before provider construction or
secret/HTTP I/O when its one-shot `quote` is invoked.

Release requires current-head checks/review, merge, health SHA verification and
fresh preview-then-confirmation measurements. PM authorized controlled temporary
quote/draft writes for that test only. Never submit an order, payment or courier
booking. Compare server time separately from test-client transport and browser
UI time. Live results are recorded in the PR after deployment, not inferred
from test success or the 6–9 second target.

Lifecycle QA also exposed 11 identical failures on unchanged `b4b3978` and the
performance branch: the payment fixture had no restaurant hours, while its
lifecycle scenarios require an open pickup window. The fixture now explicitly
uses manual all-day pickup hours; all 15 lifecycle cases pass without changing
any production dispatch rule or weakening assertions. Restaurant cache
initialization is lazy so dispatch workers importing validators do not initialize
a storefront cache that they never use.
