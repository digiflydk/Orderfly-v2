# Customer quote boundary and authoritative routing

## Runtime decision (2026-10-26)

Source configuration names, delivery documentation and available runtime environment names contain no approved Maps/Geocoding/Routes binding. No secret values were read. `resolveManagedDeliveryRuntime` therefore returns null, keeping managed quote/payment unavailable without changing legacy delivery. Optional Google code remains separately unselected. This is not evidence that the operator has no external account.

To activate: approve an authoritative route provider, billing project/cost ceiling, credential restrictions, retention/attribution and permitted verification calls; supply verified pickup contact and assemble the scoped Wolt quote provider. Native Brand/Location types contain no pickup phone, so none is invented. Dispatcher/payment acceptance remains separately required. No API, secret, collection TTL, index or production data was changed.

## End-to-end implemented path, fixture exercised

`requestManagedDeliveryQuoteAction` validates bounded input while allowing actual unchecked purchase terms. It uses the same private native pricing resolver as final checkout: active scoped products/combos/options/upsells, automatic/manual promotions, club/newsletter eligibility and authenticated discount cards. Client totals are proposals that must validate, never price authority. New managed minimum uses item subtotal after discounts; legacy minimum remains unchanged. Eligible native free-delivery campaigns use after-discount subtotal and still obey distance and subsidy/customer caps. Campaign identity is included in the authoritative digest.

The native controller verifies brand/location/currency, loads effective delivery configuration and normalizes Danish textual street/building/unit. Ambiguous or unsupported-country addresses fail; no guessed coordinates. Initial managed flow accepts ASAP only. Ready time comes from native pickup availability; separate delivery schedule and provider coverage remain required. Scheduled delivery needs an explicit ready/delivery-window translation before support is enabled.

Server-created drafts live under `deliveryCheckoutDrafts/{checkoutKeyHash}` with incrementing revisions, authoritative digest and ten-minute expiry. Digests bind both addresses, contacts, native cart/prices/fees/promotion result, timing selection and configuration revisions. Quote issuance stores the server snapshot, reserves its independent rate budget, geocodes/routes via server dependencies and obtains provider quote. Before publishing, a native transaction rereads draft revisions/digest, active tenant/location and settings. A later quote invalidates earlier draft revisions.

Claims use canonical `deliveryQuotes/{quoteRef}` plus `customerClaims/current`, with only a domain-separated hash of a fresh 256-bit token. Public DTO reveals customer fee/total/ETA/expiry, not supplier costs or credentials. Before final payment, the checkout action redoes native catalog/discount pricing and compares authoritative draft content, token, exact fee-inclusive total and currency. The same verified Stripe client/account returned by the managed payment-authority module creates the session; its account/livemode is saved on the order.

The order-creation transaction rereads the native quote, claim, current server draft and settings, then atomically consumes the token alongside the Pending order. Replays cannot fund a second order. Managed order metadata binds provider, quote reference and full quote content digest. The paid-order worker owns later provider dispatch. Zero-total or pay-at-pickup managed orders are rejected because the managed authority requires a positive verified online payment.

Quote expiry is checked again before opening Stripe. A quote accepted into a pending order is not a guarantee that its provider price remains available after payment; the paid orchestration must revalidate/reconcile and compensate according to the documented policy. An already-consumed token cannot be retried as a different order if later checkout creation fails; obtain a fresh quote.

## Rate/privacy and remaining external gates

`deliveryQuoteRateLimits` commits budget before provider calls: six requests per hashed checkout capability/minute and thirty across the current global managed-delivery scope/minute. The second guard deliberately uses a global hash, not client IP headers, until trusted edge identity is configured. Both counters expire after two windows; enable managed TTL cleanup separately before activation. Fixed windows permit boundary bursts. This protects external-call budget; earlier catalog reads still require normal platform abuse controls.

Server drafts and claims store no raw checkout capability or quote token. Customer records and address inputs are private, not logs. Configure server-only Firestore access and retention/TTL for the new transient metadata before launch. Native financial snapshot retention is separate from any third-party route content policy.

## Validation

Internal native tests exercise successful quote action through real server pricing/controller/store, exact managed amount, account binding and atomic claim/order creation using mocked network/datastore only; changed catalog, tampered total and requote invalidation reject before payment. Separate tests cover token digest/revision/expiry, native transaction rollback/replay, rate reservations and quote-vs-purchase legal terms. Existing checkout regressions cover legacy behavior. TypeScript check required. No Actions, paid provider requests or production mutation.
