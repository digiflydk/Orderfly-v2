# Worldline cancellation, abandoned windows and native zero-total checkout

PR #914 introduced the original integration. The follow-up cancellation recovery
described here needs a fresh provider sandbox check before runtime acceptance.

## Verified session expiry

The current Europe Checkout Swagger exposes `DELETE /sessions/{sessiontoken}`.
Its documented effect is setting the session status to expired; a successful
response has `meta.result=true`. There is no GET session-status endpoint in this
contract. `worldline-expiry.ts` uses that exact endpoint and the order's pinned
agreement. It never infers expiry from browser return, age, HTTP success alone,
or a network timeout.

An order-scoped `paymentOperation` marker locks capture out while expiry is in
progress. After provider-confirmed expiry, the same transaction writes Canceled,
`psp.sessionExpired=true`, `psp.sessionExpiryState=confirmed`, increments the
payment revision and clears the expiry lock. Only then can the capacity hold be
released. If an authorization callback arrives during expiry, the order remains
Canceled and its durable callback worker must void the late authorization; it
must not capture it. Hosted sessions explicitly disable instant capture in the
paired checkout adapter, so the Orderfly operation journal owns every capture.

A timeout, HTTP failure (including404), `meta.result=false` or an unrecognized
response retains the lock and reservation. Each cancellation invocation sends at
most one session DELETE; no automatic transport retry is added. The documented
endpoint expires a window, but the contract does not document404 or a failed
response as evidence that no authorization exists. Explicit retry and the existing
authenticated recovery worker keep the same original session and native marker;
neither creates a checkout or repeats a capture/credit request. Another
capture/refund operation's lock is never replaced. Orders with known authorization
use the existing verified void journal;
`finalizeWorldlineVoid(orderId,transactionId)` provides the shared cancellation
and reservation-release boundary after a confirmed void. A payment already
captured is not canceled or released as unpaid.

A matching server-to-server observation of a terminal `deleted`, zero-capture,
zero-credit authorization can finish its original cancellation without another
money POST. A different active operation cannot be cleared by that observation.
Full captured payment is reported as paid; partial capture or credit remains
unresolved and does not authorize capacity release. Decline/3DS failure text from
the browser never proves an unpaid cancellation. Scope, amount, payment method,
provider, original account and session are rechecked inside expiry transactions.

Before the first cancellation provider operation, a private
`psp.cancellationCapacity` snapshot records the original order/brand/location,
customer, discount (or null) and first-order-reservation identity. It is never
overwritten from a later request. Guest capability/admin authorization precedes
this server-only preparation; it is not a new public Server Action. Admin void
preparation checks the authorized order snapshot before provider work.

The real `releaseDiscount` transaction checks both this persisted identity and any
expected identity before reading or writing capacity counters. A caller-supplied
optional identity cannot choose another owner or substitute for missing private
metadata. Verified Worldline expiry/void with a held reservation requires the
private snapshot even on the older four-argument helper call; deleted, null or
false metadata cannot downgrade to the default path. This closes the gap between
the native Canceled commit and capacity release, including a later retry.
Only immutable ownership is compared; normal held→released progress and unrelated
UI fields are not frozen. Default Stripe and definitively failed session-create
cleanup (without provider-confirmed cancellation) retain their original contract.

Historical already-released cancellation remains idempotent. A historical held
reservation with a prior cancellation attempt but no provable original identity
requires operator reconciliation rather than guessing today's mutable customer
or discount. Restoring a verified original identity can resume the same expired
session's release without another provider operation. No data migration guesses
counter ownership.

Managed checkout cancellation with an existing authorization first expires the
window. The paired managed callback recovery adapter owns its permitted void.
An unknown create-session result without a saved token can still be canceled
when a signed callback has linked the provider transaction: cancellation uses that
verified authorization and the original pinned account, with no invented token.
Managed authorization cancellation uses its dedicated callback-scoped permit.
Without either a token or linked transaction, the due job backs off for operator
reconciliation; it never invents a token or starts a replacement payment.

## Recovery

An unknown cancellation writes only a fixed `WORLDLINE_CANCEL_*` support code to
the private native PSP metadata, and brings the original scoped expiry job
forward to within15 seconds. HTTP status and an optional one-to-six-digit numeric
provider action code can be retained; raw provider messages, bodies, credentials
and session URLs are never retained or returned. A malformed or foreign-scope
job is not overwritten. Paid status observed during this write wins over pending.

The guest cancel action validates the original cancel capability before any
provider work. Unknown Worldline outcomes return `pending` and a sanitized support
code. Both legacy brand and location cancel routes use the same verified UI;
browser query parameters alone cannot claim a successful cancellation. The UI
clearly states that status is unresolved, says not to pay again and offers an
explicit check of the same operation. It does not send automatic money requests
or offer a new checkout while cancellation is unresolved. Unexpected errors use
fixed text and never show upstream messages.

`reconcileWorldlineStaleHolds` selects tenant/code-scoped held orders older than
31 minutes. Time only selects candidates; actual provider expiry or void is
required. It attempts at most one Worldline recovery and respects the foreground
checkout's existing time budget. Stripe stale-hold handling remains intact.
`processWorldlineStaleCheckouts` processes one due `worldlineCheckoutExpiryJobs`
record per authenticated heartbeat, including orders without a discount code.
Checkout creates `{orderId,brandId,locationId,nextAttemptAt,attempts:0,createdAt}`
in the same transaction as the Worldline order, with `nextAttemptAt` 31 minutes
later. The worker queries and orders only that single field, requiring no new
composite index. Terminal jobs are deleted; unknown/error outcomes use bounded
exponential backoff. More than 50 older released/canceled orders cannot permanently
hide a later due checkout. The checkout/provider journals retain the business
and money-operation audit even after a terminal queue item is removed. No new scheduler or production job is created by this code.

## Native free checkout

A fully discounted order uses `paymentMethod=Free` and
`freeCheckout={version:1,kind:discount_card}`. It has neither PSP data nor a payment
agreement. The native proof validates the persisted 100% discount-card snapshot,
customer/brand/location identity, arithmetic and zero delivery/bag/admin fees.
It is not a Worldline transaction or a synthetic Stripe session.

`verifyFreeCheckout`, `assertFreeCheckoutOrder` and the free print transition API
provide opaque, process-local evidence for the existing transaction-scoped
settlement writer. Proofs bind the product/payment/card snapshot, payment revision
and absence of an active money operation. Forged handles, changed snapshots,
expired/backward clocks and tenant mismatch fail closed. The paired checkout and
settlement integration owns invoice, loyalty, notification and print capabilities.

## Local verification

- `node tests/unit/worldline-expiry.cjs` — provider confirmation, unknown result,
  shared-lock safety, callback race, changed agreement, verified void and managed
  pre-capture/captured cases, diagnostics and preserved locks/jobs, explicit
  same-session recovery, terminal void readback and partial-capture rejection.
- `node tests/unit/worldline-expiry-queue.cjs` — durable due selection beyond 50
  terminal orders, error backoff and scope isolation.
- `node tests/unit/worldline-stale-holds.cjs` — scope/age selection, unknown-state
  preservation, deadline and bounded attempts.
- `node tests/unit/native-free-checkout.cjs` — exact free-order eligibility,
  opaque proof/print boundary, mutation rejection and proof lifetime.
- Existing `stale-discount-holds-210`, `cart-cancel` and
  `delivery-checkout-cancel` regression suites, plus TypeScript typecheck.
- `npx playwright test -c tests/payments/playwright.config.ts worldline-cancellation.spec.ts`
  — desktop/mobile pending, manual recheck, verified cancellation, paid protection,
  absent proof and redacted errors.

Historical runtime evidence includes successful no-card cancellation on
`ORD-949526` and unresolved cancellation after a provider3DS error on `ORD-421839`
with the old `985cbfd` release. The latter incident's exact provider response is
not established. Safe stage codes and durable recovery improve diagnosis without
pretending that the incident was an unpaid cancellation. Fresh sandbox verification
of no-card, failed3DS, known authorization and late callbacks remains necessary.
Synthetic tests do not attest provider runtime, merchant configuration, IAM or
inbox/hardware behavior. No additional merchant key is needed or created.
