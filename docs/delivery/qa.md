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

For each candidate record main SHA, candidate SHA, test commands/results, independent review findings/resolutions, browser evidence, skipped/unavailable classes and reason. Re-run relevant checks after changes, not merely on an older commit. Coordinator owns serial merges and deployment, verifies actual release SHA and read-only live behavior, and retains rollback instructions. The verified foundation release is recorded in `release-readiness.md`. Subsequent integration candidates require their own current-head evidence.

## Independent review checkpoint, 2026-10-25

Reviewed implementation slices independently from their authors. Confirmed corrections include strict route calendar/timezone validation, immutable create fulfillment payload, cancellation fee identity, quote content integrity, internal-reference reconciliation readiness, safe handling of delivery events after refund, nullable ETA-only event provenance, and stale UI save-receipt rejection.

Executed independently: pricing arithmetic/boundaries/overflow, settings native scope/CAS/audit, quote service and immutable store, booking/event transaction mocks, query scope/pagination, and actual Chromium administration UI. All reported passes apply to the respective reviewed commits, not an as-yet-unverified release commit. The coordinator must run the final combined candidate's internal tests/typecheck/build and record its exact SHA.

The reviewed release boundary is **preparatory Levering administration and inactive delivery foundations**. This is not a complete delivery module: live routing, Wolt sandbox/production acceptance, actual checkout-payment-dispatch integration, compensation worker and launch activation remain separate gates. No real courier, charge, print output or production mutation was performed by QA.

## Managed delivery time selection correction, 2026-10-30

Read-only investigation of the reported Friday checkout failure found that the effective delivery schedule allowed Wednesday 11:00–21:00 and had no Friday interval. The storefront could nevertheless offer Friday times from the location's native hours. The quote service then correctly rejected that closed delivery day before pricing. This configuration observation explains the reported failure; it is not permission to open additional delivery days.

The correction must apply the effective, brand/location-scoped managed delivery schedule to customer time selection. Offer only native delivery slots that also satisfy that schedule, including date exceptions, disabled/paused state and Europe/Copenhagen time handling. Preserve native kitchen preparation/readiness and route feasibility checks: an open delivery interval alone is not enough to promise arrival. Pickup and unmanaged delivery retain their existing policies.

A closed current day must not prevent the customer from explicitly selecting a valid future day. Conversely, an explicit closed or stale selection must remain rejected with a clear request to choose another time. Do not silently replace the customer's selected time, reinterpret it as ASAP, or change delivery settings to make a rejected quote succeed. The server remains authoritative at quote creation and checkout; browser filtering is not an authorization boundary.

### Candidate validation

- Reproduce the Wednesday-only schedule with a Friday request: Friday slots are unavailable and a forged or stale Friday selection cannot obtain a quote or payment session.
- Verify an explicit future Wednesday slot before the restaurant opens is selectable and accepted when preparation, route and provider constraints are satisfied.
- Cover schedule exceptions, exact closing boundaries, disabled/paused delivery, empty future availability and brand/location isolation.
- In the real component browser harness, verify changing the selected time recalculates the quote, stale prices cannot enable payment, and no explicit selection is silently changed.
- Run relevant native/quote and browser regressions, full typecheck, production build and independent current-head review. Record commands, counts and the reviewed SHA after execution; this section does not claim they have passed.
- After merge, verify deployed release ancestry and read-only storefront time selection. This bounded correction does not establish completion of Stripe/Wolt courier lifecycle, print or feedback acceptance in #691/#694.

The user requested correction of the reported failure. Authenticated administration verified native Friday hours of 11:00–22:00 and preorders enabled. Only Friday's local delivery interval was corrected from closed to 11:00–22:00 in the existing sandbox merchant configuration; the save confirmation and rendered values were verified. Other days, activation and provider environment were preserved. No payment or courier booking was performed.

Internal regression: 54/54 unit/native tests and 85/85 actual Chromium component tests passed, zero skips. Commands: `node --test tests/unit/delivery-public-schedule.cjs tests/unit/delivery-public-schedule-server.cjs tests/unit/delivery-native-checkout.cjs tests/unit/checkout-availability.cjs tests/unit/delivery-customer-failure.cjs tests/unit/delivery-quote-service.cjs tests/unit/delivery-settings.cjs`; `CART_CHROMIUM_PATH=/tmp/chromium node --test tests/unit/checkout-browser.cjs tests/unit/managed-delivery-checkout-ui-browser.cjs`. Full typecheck passed. Native controlled fixtures verify Friday 11:50 and 12:05 before opening, rejection with Wednesday-only settings, and accepted quote/payment when Friday is enabled. These are internal provider/payment fixtures, not a new external payment or courier test. Production build and final review/release verification are recorded in the PR.

## Confirmation updates and kitchen pickup time (2026-10-30)

Paid delivery confirmations continue polling the existing receipt-authorized lookup every 10 seconds. Requests preserve session, receipt token, order and tenant scope; `status_only=true` bypasses payment reconciliation, not receipt authorization. Hidden tabs pause reads, returning tabs refresh immediately, transient failures retain the last known ETA, and delivered/refunded/failed-payment states stop polling. Unmount aborts outstanding reads. The manual status button also refreshes in place.

Kitchen print snapshots now include the accepted booking's pickup interval before courier callbacks arrive, only after matching order/brand/location, provider, request digest, attempt reference and native delivery ID. Verified callback pickup times take precedence. A prominent `Klar til afhentning (planlagt)` uses the beginning of the booking pickup window; verified times use `Klar til afhentning`. Customer requested delivery and preparation duration are never substituted for courier pickup. Missing pickup evidence remains explicitly unconfirmed. No extra automatic print is triggered by polling.

Validation covers real Chromium receipt polling after payment, ETA appearance without navigation, transient error recovery and terminal stop; native receipt projection and rendering at both paper widths, foreign evidence rejection, and existing atomic delivery acceptance/printing tests. Physical printer verification still requires a real device; internal tests do not claim a paper receipt was inspected.

## Faster quoting and one customer estimate (2026-10-30)

Complete valid checkout details trigger automatic quoting after 250ms of quiet typing instead of 700ms. Obsolete requests still cannot authorize payment or replace a newer address/cart. Known server latency is reduced by removing the duplicate action availability preflight, initializing independent adapters concurrently and resolving both addresses concurrently. Authoritative gates before draft writes and provider use, quota limits and exact endpoint identity remain enforced. Production response time still depends on external services; internal concurrency tests do not promise a fixed live duration.

Managed default delivery is effective location preparation plus 30 minutes transport, using existing opening hours and five-minute slots. At 12:40 with 20 minutes preparation, the default is 13:30. Quote and payment validation use the same transport baseline. Pickup and legacy delivery keep their existing settings. Before a provider quote there is one approximate default time; a valid current provider estimate replaces it in the same checkout field before payment. Customer intervals render as one approximate latest-bound time, never an invented earlier promise. Confirmation shows one final provider estimate, with a clearly labelled server-derived preliminary arrival fallback only while a valid ETA is unavailable and the delivery is still active. Provider estimates are never increased by preparation again. Spending longer before payment or provider delays can still move the actual estimate.

## Single kitchen pickup time (2026-10-30)

Kitchen receipts show one prominent `Klar til afhentning` box using the earliest pickup time from verified courier evidence, or the scoped booking fallback. The secondary courier pickup line and `(planlagt)` suffix are omitted on kitchen receipts. Customer receipts, missing-time messages and cancellation/failure warnings keep their existing behavior.


## Immediate delivery-price feedback

The customer sees a nonmodal “Henter leveringsprisen…” popup immediately when all quote prerequisites are valid, including the 250 ms typing debounce and any latest request queued behind obsolete provider work. It never moves keyboard focus or traps typing; Escape or “Skjul beskeden” hides it while calculation continues. A new input identity opens a new indication, and success/error/incomplete input closes it. Errors still require explicit retry or corrected input, with no automatic provider retry loop.

Address completion alone cannot authorize a binding quote: customer identity, pricing/club/newsletter rules and provider contact need valid name, email and phone too. An address-complete/contact-incomplete checkout explicitly asks for those details rather than pretending a provider request started. Backend authority and payment-proof guards are unchanged.

Chromium regression in `tests/unit/managed-delivery-checkout-ui-browser.cjs` covers visibility before the debounce, focus retention, serialized obsolete requests, error closure, dismissal without cancellation, changed-input reopening and missing-prerequisite suppression.

## Quote latency measurement (2026-10-30)

Quote responses include bounded timing metadata containing only fixed stage names, integer milliseconds and counts. AsyncLocalStorage isolates concurrent requests; inputs, contacts, addresses, quote capabilities, provider payloads and errors are excluded. The checkout logs `delivery_quote_timing` with client elapsed time around the awaited server action and validated server timings. Client duration includes framework/network waiting but excludes typing and the debounce. Nested and parallel stage totals overlap and must not be summed as total latency. Instrumentation does not authorize payment or change quote failure handling. Use an explicitly authorized non-payment checkout test to collect live timings before attributing a bottleneck or claiming a speed improvement.
