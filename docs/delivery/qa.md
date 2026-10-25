# Levering independent acceptance plan (#657)

## Evidence and environment

Initial baseline: `dfae7f58260060cac2404a33eea6833bfa3d55f1`. QA owner is agent F, independent of implementation. This document defines acceptance; it does not assert feature completion.

On 2026-10-25 the internal runtime had Node v24.22.1 and existing repository dependencies. Playwright Chromium successfully launched, rendered a button, read its text and closed. This proves browser availability only. Firefox/WebKit, authenticated datastore sandbox, Stripe test credentials, Wolt sandbox and production release access remain unverified. Node 24 meets the package's >=20 requirement; release runtime parity must still be checked.

Tests run internally. No GitHub Actions dispatch, rerun, test or deployment is permitted for this work. Existing branch-protection requirements must be inspected by the coordinator; any conflict must be recorded without bypassing protection. Existing repository documentation that refers to Actions does not override the newer PO instruction.

The existing `tests/unit/order-terminal-browser.cjs` demonstrates a reusable actual-React/CSS browser harness with synthetic HTTP. Such tests exercise rendering and interaction but do not prove real authentication, database transactions or external providers. Avoid running broad browser suites that may default to production credentials or URLs.

## Acceptance matrix

| Area | Positive evidence | Required rejection and recovery evidence |
|---|---|---|
| Scope and permissions | Superadmin and authorized brand/location read/write | Foreign brand/location, revoked access, missing scope, forged IDs, hidden economics and secret fields |
| Defaults and overrides | Brand inheritance and local override/reset survive reload | Stale update, invalid settings, unauthorized reset, failed save retains editable values |
| Hours | Normal, exception-day, scheduled and paused behavior | Closed hours, midnight, Europe/Copenhagen DST gap/overlap, too-long transit |
| Address and route | Validated address and routed meters with source/profile/time | Ambiguous/invalid address, missing service, route timeout, no zero-distance fallback |
| Pricing | Bands and proportional kilometer formula, exact minor-unit rounding | Every edge ±1 meter/minor unit, gap/overlap, unsafe integer, currency/tax mismatch, negative or missing input |
| Discounts | Minimum on authoritative discounted merchandise total | Bag/admin/delivery excluded; cart/item/voucher interaction; free-delivery cap conflict rejects honestly |
| Quote | Correct customer fee, supplier cost and ETA before payment | Expired quote, cart/address/location/time mutation, stale response ordering, tampered price |
| Booking | One durable request identity per accepted attempt | Double click, concurrent requests, retried transaction, lost response; unknown never blindly rebooks |
| Payment | Verified provider payment transition and delivery acceptance | Payment decline, late success, booking failure, release/refund failure; no false delivered-order confirmation |
| Events | Legal progress with provider original status preserved | Duplicate IDs, older events, conflicting terminal events, foreign references, invalid webhook signatures |
| Cancellation | Supported cancel plus fee/intent disclosure | Unsupported cancel, concurrent delivery, timeout; reconcile rather than fabricated success |
| Administration | All pages under Levering; pagination/filter/scope works | Empty/loading/offline/stale states, errors expose next action and no secrets |
| Customer tracking | Authorized order link/status/ETA | Foreign order access and unsafe external tracking URL |
| Merchant app | Delivery details separate from kitchen/payment progress | Ready never implies collected/delivered; unauthorized transitions fail |
| Printing | Existing pipeline renders address/instructions/reliable times | Event replay does not create duplicate original jobs; pickup rendering unchanged |
| Legacy transition | New feature defaults off and pickup still works | Existing delivery/pricing flows unaffected until explicit switch; migration replay/rollback tested |

Use synthetic brands A/B, locations A1/A2/B1, fixed clocks and dummy customer data. Record expected amounts explicitly in assertions rather than computing expectations through the implementation under test. Fault injection must test the actual service/state boundary, not a second model of its behavior.

## Browser and accessibility evidence

Exercise actual components at 390×844, 768×1024, 1024×768 and 1440×900. Check no page overflow, touch targets, tab order, visible focus, keyboard dialogs, associated labels, readable validation, busy state/double-submit handling, screen-reader status announcements, contrast and zoom/reflow. WCAG 2.2 AA is the design/acceptance target; a few browser assertions are not a certification of full conformance.

Test the real app's authenticated routes and API authorization in an isolated environment separately from mocked component tests. iPad viewport emulation does not prove physical iPad Safari, sleep/background behavior or accessibility assistive technology support.

## Required evidence classes

1. Internal pure/service tests: pricing, validation, state, scope and transaction boundaries using isolated dependencies.
2. Internal real-browser tests: actual UI and real rendering, with any stubbed API or auth clearly labeled.
3. Wolt/Stripe sandbox integration: verified provider requests/events, no real charge or courier order.
4. Read-only production QA: actual deployed SHA, route availability and authorized views, no test data writes.
5. Supervised physical acceptance: actual device/receipt/courier behavior, only when specifically authorized.

A pass in one class cannot stand in for another. Record blockers by class and name the owner and next step. Default-off deployment may be accepted independently of customer activation; it does not complete Wolt integration or launch acceptance.

## Release record

For each candidate record main SHA, candidate SHA, test commands/results, independent review findings/resolutions, browser evidence, skipped/unavailable classes and reason. Re-run relevant checks after changes, not merely on an older commit. Coordinator owns serial merges and deployment, verifies actual release SHA and read-only live behavior, and retains rollback instructions. No current candidate has passed these gates yet.

## Independent review checkpoint, 2026-10-25

Reviewed implementation slices independently from their authors. Confirmed corrections include strict route calendar/timezone validation, immutable create fulfillment payload, cancellation fee identity, quote content integrity, internal-reference reconciliation readiness, safe handling of delivery events after refund, nullable ETA-only event provenance, and stale UI save-receipt rejection.

Executed independently: pricing arithmetic/boundaries/overflow, settings native scope/CAS/audit, quote service and immutable store, booking/event transaction mocks, query scope/pagination, and actual Chromium administration UI. All reported passes apply to the respective reviewed commits, not an as-yet-unverified release commit. The coordinator must run the final combined candidate's internal tests/typecheck/build and record its exact SHA.

The reviewed release boundary is **preparatory Levering administration and inactive delivery foundations**. This is not a complete delivery module: live routing, Wolt sandbox/production acceptance, actual checkout-payment-dispatch integration, compensation worker and launch activation remain separate gates. No real courier, charge, print output or production mutation was performed by QA.
