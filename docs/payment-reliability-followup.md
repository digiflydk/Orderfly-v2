# Payment reliability follow-up

This follow-up addresses the test findings after merged PR #914. The reference
baseline is `985cbfd`; baseline failures and successful sandbox payments are not
evidence that the new code is deployed. Local, isolated validation and actual
provider acceptance must be reported separately. GitHub Actions remain disabled
by the PM's explicit instruction; commits and PR titles use `[skip ci]`.

## Return and original financial authority

The browser return validates the private receipt capability before provider
access and retains the order's original merchant, environment, exact secret
version, transaction, currency and server-calculated amount. Normal success
requires fully captured, uncredited native Paid and the existing authoritative
settlement. It never creates a fake Stripe session or accepts browser approval.

The return budget is sixty seconds, including observations and the existing
fifteen-second capture timeout. Safe reads have bounded retries. There is one
normal reconciliation; subsequent capture recovery requires its existing journal
and is explicitly observation-only. A missing, changed or deleted journal cannot
create permission for a new money request. Financial completion is observed
independently of later Wolt dispatch work.

Refunds and confirmed voids are final outcomes separate from successful checkout.
Full and partial refunds require exact original-account provider credit matching
native accounting. Verified deletion requires zero captured and credited amounts.
The final receipt shows the actual outcome and partial amount, preserves the
original invoice, and emits no new purchase conversion or stamp celebration.
An in-progress refund may finish its accounting before this display is resolved;
the display observer initiates no capture, credit or cancellation.

An exceptional unresolved result gets an accessible uncertainty page and a fixed
support code. Its retry link checks the same private payment and strips unrelated
provider fields; it never points to payment creation. Normal success has no
intermediate HTML waiting page.

## Money journals and accounting

New journals retain the original order/account/scope/customer identity and the
original invoice number for credits. The identity is checked within claim, all
replays and final accounting. Changed native amounts, tenants, customer IDs,
providers, agreements or refund invoice references cannot apply money/accounting
to a new identity. A new capture requires Pending; an already Paid order cannot
start another capture merely because a provider observation is inconsistent.

An uncertain response retains the journal and lock. Recovery observes the same
provider transaction, not a new financial POST. Historical unknown credit
journals that never recorded original customer/invoice identity are explicitly
marked for operator reconciliation. The system does not infer the historical
customer from today's mutable order. This is not an automatic financial repair
or a migration of payment history.

## Cancellation and capacity

Session expiry uses the documented Europe DELETE contract and original agreement.
Browser cancellation, a 3D Secure error, HTTP404 or `meta.result=false` is not proof
of expiry. Unknown outcomes retain their lock/reservation, expose only bounded
support diagnostics and schedule the original recovery job sooner. Explicit
rechecks retain the same payment identity; no automatic money retry is introduced.

Only provider-confirmed expiry or verified zero-capture void permits native
cancellation and capacity release. The release path must retain and transactionally
verify the original capacity owner and discount identity, including retry after
a completed cancellation. See [cancellation contract](worldline-cancel-free.md).

## Validation and release evidence

Relevant checks include the return/helper/callback suites, full real-code
checkout→capture journal→settlement→invoice/print integrations, full/partial
terminal receipt acceptance, operations/admin/managed delivery regressions,
capacity-release races and desktop/mobile receipt/cancellation browsers.
Typecheck and independent review must refer to the final integrated head.

Actual provider verification needs fresh T-merchant sessions with the existing
manually entered keys. Repeat successful checkout/reload, no-card cancellation,
failed3DS cancellation and managed delivery. Record safe support codes if a
provider result stays unknown; never turn an unknown cancellation into a claimed
success. Actual admin refund/void, physical print and iOS Safari require their
own authenticated/device evidence. Isolated tests do not fill those gaps.

Worldline controls the separate hosted page and its loader scheduling. The
inspected public frontend schedules its loader one second later; actual blank
repaint duration was not measured. No documented merchant API setting controls
that timer. This boundary is documented, not falsely marked as a merchant-code fix.
