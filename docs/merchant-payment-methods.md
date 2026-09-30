# Merchant payment methods and pickup settlement

Request: 29 September 2026. Payment/KPI regression reference: GitHub #189.
Baseline main: `6a8a5895c1cddfb4db162ba2b1e65722b5d2d88d`, App Hosting build 028.

## Before / after

| Area | Before | After |
| --- | --- | --- |
| Configuration | Checkout always required Stripe | `/merchant/payments`: independent Online betaling and Betal ved afhentning switches per location, at least one required |
| Existing merchants | Online checkout | Missing paymentMethods defaults to online true / payAtPickup false; no bulk data write |
| Online orders | Pending until verified payment | Same Stripe session/pricing; still cannot prepare or count as paid until verified |
| Pickup orders | Required Stripe | Received / payment Pending without Stripe configuration, coupon or session |
| Receipt, lists, portal | Online/card display | Explicit “Betales ved afhentning” and amount due; browser confirmation and order overview, no paid invoice before payment |
| Merchant actions | No pickup settlement | Cash/card payment with verified employee and server timestamp; one atomic settlement; separate unpaid cancellation |
| Promotion usage | Hold until Stripe payment | Same capacity hold and final paid accounting for either method |

The #189 Paid-only sales predicate already existed in this baseline. It is
preserved and tested with Received/Pending pickup orders: Received is not proof
of payment. Before release, the authenticated deployed order list showed 52
paid orders / 7,659.55 kr and pending ORD-374737 (116.10 kr) as awaiting payment.
This observation does not mutate or reclassify historical orders.

## Settings and authorization

`locations/{id}.paymentMethods` stores booleans `online` and `payAtPickup`.
Explicit false remains false. Neither, missing fields and non-booleans cannot
be saved. Locations without pickup cannot disable their sole usable online
method. A pickup/delivery location may select pickup-only payment; delivery then
has no selectable method and submission is blocked, on both client and server.

Settings use existing catalog view/edit grants; orders use existing order
view/edit grants. No role/authentication migration. Locations and orders are
queried within the caller's native merchant grants. Mutations authorize verified
identity against the stored brand/location and current access policy inside the
write transaction. This also guards concurrent revocation/reassignment. Foreign
locations, revoked memberships and read-only staff are rejected. Settings update
only paymentMethods/updatedAt and create an audit with actor and before/after.

## Order lifecycle

| Event | Order | Payment | Financial effect |
| --- | --- | --- | --- |
| Online session created | Pending | Pending | Hold only; no sale, preparation or invoice |
| Verified paid Stripe session | Received (or existing preparation status) | Paid | One invoice, paid totals and campaign accounting |
| Unpaid Stripe cancel/expiry/failure | Canceled | Failed | Release only, replay safe |
| Accepted pay-at-pickup | Received | Pending | Hold only; visible in merchant queue and can prepare |
| Prepare unpaid pickup | In Progress / Ready | Pending | No paid sale; Completed/Delivered status shortcut rejected |
| Record cash/card in restaurant | Existing preparation status | Paid | One invoice, paidAt, employee/form/time, campaign accounting |
| Cancel unpaid pickup | Canceled | Failed | Release only; no invoice/sale; repeated action unchanged |

Pickup acceptance re-reads native location settings and fulfillment time in a
transaction after committed capacity. Known rejection releases the hold; an
ambiguous database response retains reference/hold and asks the customer to
contact the restaurant instead of duplicating the order. The encrypted checkout
attempt cache also caches pickup receipt URLs; changing a basket under the same
attempt key is rejected.

Restaurant delivery is the native Received order in `/merchant/orders`, refreshed
every 20 seconds, with full items/options accessible through order detail. No new
POS push integration is implied. The unpaid browser receipt confirms acceptance.
The existing paid invoice/confirmation outbox runs only after payment.

“Registrér betaling modtaget” accepts cash or card in restaurant. The browser
cannot supply the amount, employee or time. `paymentCollection` records receivedAt,
employeeId, employeeName and method. Repeated requests preserve the original form
and invoice. Paid transition, invoice counter, customer paid totals, discount
capacity/usage, upsell/game conversions, outbox and payment audit commit together.
Payment/cancellation races have one authoritative outcome.

## Promotions and receipts

Both methods share existing server catalog/option validation and item/cart/code/
automatic discount selection, stacking, combos, triggered upsells, game products,
minimums, fees and VAT before the payment branch. Final lines, discount breakdown
and total are stored on the order and not recalculated at pickup settlement.
Campaign dates/scopes, minimums, per-customer/first-order rules, newsletter consent
and existing payment/campaign terms are preserved.

Existing discount/customer/pair ledgers reserve one-use capacity at order creation.
A held pickup order blocks parallel pickup/online use and existing restaurant
game redemption. Cancellation releases held capacity; payment changes held to
paid and consumes usage once. The game voucher remains issued while held, becomes
redeemed on payment and creates one conversion. Cancellation creates no conversion.
Pickup holds have no Stripe expiry; cancel the unpaid order to release them. Do
not clear holds because a client timed out.

Pickup guest receipts require the order plus its dedicated 64-hex random receipt
capability, stored only as a hash, and matching tenant/location. They never call
Stripe or disclose PSP/cancel secrets, staff names/identities or arbitrary database
fields. Previously issued Stripe receipt capabilities remain supported.

## QA results

Local unit tests execute production functions with synthetic database/identity
I/O. The new Playwright fixture joins actual React checkout, confirmation, merchant
queue/settings to actual checkout, receipt, settlement, cancellation and sales
functions. External database/Stripe transport is simulated; these tests never
write deployed data. Browser runtime: Chromium 138. No package/lockfile changes.

| Acceptance | Result |
| --- | --- |
| Method matrix | 4 configurations (including invalid neither) × pickup/delivery × selected online/pickup × code/no code; invalid selection rejected before order/Stripe |
| Mobile cash and desktop card promotion orders | 100 kr pizza + 4 kr bag − SAVE10 = 94 kr, checkout → receipt → merchant, no Stripe; prepare while unpaid |
| Actual paid dashboard | Before payment count/revenue 0/0; after payment 1/94; replay remains 1/94; paid discount 10 |
| Three concurrent/repeated payment requests | One invoice, customer increment, capacity/usage/conversion and audit; another requested form does not overwrite the first |
| Cancellation/replay | Held 1 → 0; paid count/revenue remain 0; code usable again; no invoice/conversion |
| Pay/cancel race | First succeeds, conflicting second rejects |
| Automatic/product/quantity/combos/upsell parity | Identical stored pricing and discount breakdown across both methods; verified upsell conversion once |
| Game product code | Held while unpaid, redeemed/conversion once when paid; issued and no conversion after cancel |
| Tenant/revocation | Foreign brand/location, view-only and revoked staff blocked; preparation also blocks revocation between precheck and write |
| Separate online browser test | One hosted Stripe transport, Pending paid KPI 0; verified payment/replay produce one Paid sale |
| Merchant settings browser test | Cannot disable both; saved pickup-only updates pickup checkout and blocks delivery; disabled pickup hidden for online-only |

Validation: TypeScript and optimized production build passed; 47 new backend
tests, 5 new browser acceptances, 41 existing checkout browser regressions, 166
related existing unit tests and 13 game schema tests. The related suites cover
checkout reliability/pricing/attempt/persistence/availability/route/recovery,
payment confirmation outbox and #189 lifecycle, #192 discount conflict, automatic
discounts, game product/restaurant redemption, newsletter/order-flow #71, cart
restore/cancel and order/location/promotion authorization.

Existing I/O fixtures were updated for missing newsletter config/sync,
promotion-date and the new authorization import. No assertions were removed or
relaxed. Initial restricted-loopback/subprocess failures were rerun with local
runtime access. Run each suite individually in a restricted executor:

```sh
npm run typecheck
npm run build
node tests/unit/merchant-payment-methods.cjs
node tests/unit/merchant-payment-browser.cjs
node tests/unit/checkout-browser.cjs
```

## Release / deployed acceptance

The user explicitly authorized merge/deploy without GitHub Actions, overriding
normal Work/PO release separation for this request. Commits use `[skip ci]`.
Temporarily set the PR-close trigger to workflow_dispatch before merge, then
restore the original workflow byte-for-byte: pull_request_target does not honor
skip-ci. No workflow dispatch. App Hosting project is
`orderfly-v21-10334086-b3076`, backend studio; data stays `orderfly-39325`.

Record deployed commit/build and named synthetic order references and paid KPI
before/after. Use the user's authorized sandbox test card for separate real
hosted Stripe acceptance. Preserve/restore temporary location settings and cancel
unpaid QA orders. Local simulated Stripe transport is not a real hosted sandbox
acceptance. Issue #189 is not automatically closed by merge.
