# Native local delivery administration acceptance (#691)

This bounded harness runs the actual Next application, Firebase Auth emulator,
Firestore emulator, delivery APIs and administration components. It does not
mock API responses, inject session cookies into browsers, or bypass login.
The delivery module remains inactive throughout.

## Execution

Use a clean checkout without `.env`, `.env.local`, `.env.development` or
`.env.development.local`. Install repository dependencies. Supply absolute paths
to Firebase CLI 15.30.0, Java 21 and a compatible Chromium binary:

```sh
QA0_FIREBASE_BIN=/absolute/path/to/firebase \
QA0_JAVA_BIN=/absolute/path/to/java \
CART_CHROMIUM_PATH=/absolute/path/to/chrome \
node tests/local-qa/delivery-run.cjs
```

`--api-only` runs native authorization and persistence checks without the browser.
The launcher requires unused loopback ports 3100, 8088, 9099, 4400, 4500 and 9150.
It runs the seed/scenario/cleanup twice against the same emulator and app.
Only fixed sanitized phase names are printed on failure; protected process logs
remain local. No GitHub Actions are involved.

## Isolation and cleanup

The unchanged QA0 environment builder and loopback network guard are reused.
Child processes do not inherit provider secrets, production credentials or ADC.
The app uses only `demo-orderfly-qa0`. Browser requests and sockets are restricted
to the local app/emulators. No routing, Wolt, Stripe, mail or printer endpoints
are enabled. Synthetic account passwords are generated in memory.

The fixture refuses existing owned seed documents, including the global test
access-control document. Atomic create prevents partial fixture ownership.
Cleanup deletes only its created Auth users and explicitly owned document trees,
verifies their absence, and never deletes a pre-existing collided control record.

## Assertions

- Actual native sessions and settings transactions persist configuration and audit.
- Anonymous, foreign-brand, mismatched-location, viewer-write, cross-origin and
  stale-revision requests are rejected.
- Actual delivery-list API loads and denies the foreign location.
- Browser logs in through the normal Firebase login form.
- At 390×844, 768×1024, 1024×768 and 1440×900: save, reload, inherited location
  settings, empty delivery list and no page overflow.
- Keyboard focus and Enter activate settings and save; successful save is announced.
- The foreign brand is absent from the scoped selector and viewer controls are disabled.
- No unhandled browser errors; cleanup succeeds twice without leftover seed state.

## Evidence boundaries

This is native local administration acceptance only. It does not prove external
Stripe/Wolt integration, actual customer checkout, provider callback ingestion,
merchant tracking, physical printing, feedback sending, Safari behavior, full
WCAG conformance, or production activation. Existing component/service tests
cover other surfaces separately. Keep #691 open until its full matrix is proven.

## Verification checkpoint, 26 October 2026

The full runner passed twice against the same emulators, including existing-root
and orphan-child collision preservation, all four viewports and cleanup. There
were zero unhandled browser errors. Java 21.0.13, Firebase CLI 15.30.0 and the
installed compatible Chromium were used. Typecheck and JavaScript syntax checks
passed. The shared admin shell's external logo fetch was blocked by the unchanged
server network guard and returned an image error; no external access was enabled.
This does not affect the bounded delivery-control assertions and is not a claim
that the complete shared shell rendered without missing assets.

## Closed-hours checkout and failure feedback (2026-10-27)

Managed checkout converts its next-opening-day ASAP display into an explicit scheduled instant when the native kitchen is closed. The same instant is submitted for the delivery quote and payment; native slot validation, delivery hours, preparation/transport lead time and Wolt scheduling restrictions remain authoritative. Open-kitchen ASAP behavior is unchanged.

Quote failures expose only fixed customer-actionable codes (closed, invalid address, route unavailable, minimum, pricing cap, unsupported schedule). Unknown errors and upstream payloads stay private. Checkout form state now lives above cart readiness so switching from delivery to pickup preserves entered customer fields while repricing; nothing is persisted to browser storage by this change. Changing restaurant resets the form.

Regression coverage: `delivery-customer-failure.cjs`, `delivery-native-checkout.cjs`, `checkout-browser.cjs`, `managed-delivery-checkout-ui-browser.cjs`. The browser fixture deliberately unmounts the form during delivery-mode repricing, matching the live cart behavior. A fixed-clock browser scenario verifies that next-day quote and payment use the same displayed time.

Live QA remains in progress on Esmeralda's sandbox configuration with pickup at Borgergade 10. Do not restore Albaniensgade 6 until the full customer-flow matrix passes. Successful internal tests alone do not establish live Wolt/Geoapify/payment/callback completion.

## Quote failure diagnostics

The operator delivery log includes the latest failed quote before an order exists. It is one bounded record per managed location, throttled to one write per five seconds, containing only a fixed stage, allowlisted code and timestamp. No customer data, provider payload, credential, raw exception or price is recorded. Reads use the existing order-view authorization and exact brand/location checks; guest responses retain the customer-safe error projection. Diagnostic persistence is best effort and never changes quote acceptance.

### Customer identity feedback during delivery quotes
Live QA at Esmeralda (Borgergade 10 sandbox) obtained a 39 DKK quote / 201 DKK total with a fresh test identity. Earlier mismatched test details stopped in pricing before the provider. Quote failures now reuse the existing privacy-preserving checkout identity message and a fixed diagnostic code; identity resolution and tenant safeguards remain unchanged. Unknown failures remain generic. Regression tests cover all seven identity conflicts, rejection before provider/payment writes, and correction/retry with the basket retained. Live address changes revoked the quote; delivery-to-pickup retained contact fields after the deployed form fix. Full payment/booking validation remains pending.

Live checkout then exposed an HTTP transport mismatch: the storefront sends the accepted managed delivery proof as argument twelve, but the session endpoint accepted only the eleven legacy arguments. The HTTP schema now validates and preserves that proof for the existing authoritative action checks. Legacy checkout remains supported; malformed/extra proofs, pickup proofs and missing addresses fail before any attempt/order creation. Native acceptance tests retain amount, token, expiry and replay protections. Live invalid-address and outside-area rejection passed; payment retest follows deployment.

### Paid booking follow-up, 2026-10-27 UTC

Live sandbox order ORD-292972 passed a declined-card retry and successful DKK 201 payment, then booking rejection and automatic full refund. The receipt previously still said paid and checking delivery after refund; it now reflects refund/rejection and separates paid-awaiting-booking from awaiting payment. Authorized order detail exposes only an allowlisted, scope/digest/attempt-bound booking rejection code, without provider payloads or customer data. The booking root cause and successful courier flow remain under investigation; this is not a completed end-to-end acceptance. Borgergade remains the test pickup.
