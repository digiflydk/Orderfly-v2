# #209 and #187: conversion history and fulfillment dialog

Baseline: main 466836632b4aaf81dc5691c3e15ee57e4a06b2f8, Firebase build-2026-10-01-008, verified Current in console. PRs #213/#214 and subsequent #212/#126 changes retained. Owner explicitly authorizes merge/deploy and controlled reversible administration/cart/checkout QA. No orders, payments, provider signups, messages, rights changes or reservation resets.

## Confirmed causes

- #209 list: getDiscounts spread the entire Firestore record but normalized only four top-level dates. applicationHistory[].changedAt remained a Firestore Timestamp. Actual Flight serialization of that shape reproduces the reported plain-object error. Live list reproduced on baseline at 2026-10-01T23:17:16Z. Prior QA runtime digests: 419807776 / 3118730112.
- #209 checkout: separate checkout reader had the same shallow normalization. Successful validateDiscountAction returns the complete discount, including history, across Flight. Test exercises actual reader + action + Flight, and calculates 140 - 14 + 4 = 130 without writes. Baseline live converted code separately reproduced “Rabatten kunne ikke kontrolleres. Prøv igen.” (screenshot).
- #187: the imported timeslot-dialog.tsx calls handleDateChange(today) on open, clearing internalTime. Both cart TimeSelector and CheckoutClient use it; similarly named time-slot-dialog.tsx is unused and is not the fix target. Baseline live: saved 3 October 11:15 then reopened with 2 October selected and no time.

## Changes

Shared discountRecord normalizes the entire authorized/read record recursively using existing client-data serializer. No history deletion, migration or database rewrite. Admin detail/list and checkout ID/code readers share it. Permissions and tenant filters unchanged.

Time dialog initializes its local draft from saved selection each opening. Cancel does not commit. Calendar opens on the saved month/day. Slots use the same fulfillmentSlots validation as server, refresh on clock/focus, and unavailable selections remain visible with a Danish explanation. Save revalidates against current clock, preserving the selection on failure. Overnight slots retain the correct opening day. No price/reservation/payment changes.

Additional #187 precision finding: unchanged Firestore dates previously round-tripped through JavaScript Date, losing sub-millisecond nanoseconds. The four promotion save actions now retain the original Timestamp when the calendar day is unchanged; changed dates still use Copenhagen boundaries. No automatic migration. A real Timestamp with nanoseconds123456789 is covered.

## Automated evidence (not live acceptance)

- Typecheck passed.
- 117 Node tests passed: promotion-209-187, promotion-qa-209, promotion-212, commerce-p1, automatic-discounts, discount-conflict-192, newsletter-discount, native-selector-access, location-catalog-access, upsell-form-data, promotion-review.
- 5 actual React/Chromium dialog tests passed: pickup/delivery cancel-save-reopen; expired selection; controlled-clock expiration; month boundary/DST with browser timezone America/Los_Angeles.
- Actual Flight serializer rejects old Timestamp shape and accepts list/detail/checkout results after fix.
- Actual save transaction test preserves ID, usage 7, order reference, pre-existing history and precise unchanged date milliseconds; existing newsletter does not block conversion; empty/reserved manual codes rejected without write.
- Controlled Node clock exercises actual checkout start/end rejection, inclusive last millisecond and next-day expiry for 2, 4, 24, 25, 26 October. Calendar/DST tests are automated, not a claim of waiting live at midnight.

## Live protocol and cleanup register

Existing QA 8c02ibS8bqDJuDAjHb0E baseline: QA20261001-LIVE-RETEST; code; inactive; percentage10; minimum0; both modes; all weekdays; 00:00–23:59; limits0/0; all customers; first-time false; stacking false; description “QA 2026-10-01 live retest; deactivate after testing”. Start24Oct00:00 UTC+2, end26Oct23:59:59 UTC+1 (Firestore UI second precision). Four history entries, usedCount0, no order reference field present. Before-test temporarily activated and moved start to2Oct; restore original dates/inactive and preserve appended audit history after tests.

Browser cart actually restored at checkout: combo115 (Pepperoni10 + Dressing10), Pepsi20, Faxe40; total175 + bag4 =179. Earlier stale menu showed seven Pepsi but checkout restored the above current basket; use current basket as baseline.

Post-deploy: repeat conversion roundtrip, list reloads, checkout pricing, reserved-code rejection, calendar dates and unchanged save; admin new/combos/locations and actual upsell Edit; pickup/delivery dialog in cart/checkout. Record exact build/commit and outcomes in #209/#187. Merchant/brand live access tests NOT PERFORMED: no accounts, no permissions to be expanded. Automated scope tests do not substitute for these.

Issue closure requires documented acceptance. Latest release/live evidence and remaining blockers are in the issue comments; this pre-release document alone is not a live approval.
