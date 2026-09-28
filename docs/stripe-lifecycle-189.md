# Stripe checkout lifecycle (#189)

An order starts `Pending` and is absent from paid revenue. A signed
`checkout.session.completed` event settles it only when `payment_status` is
`paid`; an unpaid completion can await asynchronous confirmation. Signed
`checkout.session.async_payment_succeeded` uses the same idempotent settlement.
The new `async_payment_failed` handler closes the unpaid order and releases its
promotion capacity. An expired session or an authenticated customer cancellation
also closes the attempt. All closure paths retain the order for audit and check
its brand, location and linked session. A late expired event cannot downgrade a
paid order. Superadmin status edits cannot close or prepare an unpaid session
without Stripe verification.

No historical orders or counters are migrated by this change. `ORD-671268`
remains visible as an unpaid attempt; `ORD-457245` remains the paid regression
baseline. The paid invoice, customer totals, notification job and discount
capacity are committed in the existing settlement transaction. Repeated paid
events return without reissuing them.

Run `node --test tests/unit/stripe-lifecycle-189.cjs
tests/unit/takeaway-qa-regressions.cjs tests/unit/admin-sales-filters.cjs`
and `npm run typecheck`. The tests cover pending completion, failed asynchronous
payment, replay, expiration scope, admin rejection and paid sale projection. An
approved sandbox preview with Stripe/Firebase access is still required to open
and cancel or expire a new hosted checkout, then compare customer, Superadmin
and merchant views with paid KPI and the existing paid order. Do not use a real
customer order or edit historical sales records for that check.
