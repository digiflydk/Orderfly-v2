# Worldline cancellation, abandoned windows and native zero-total checkout

PR #914 candidate; no production provider acceptance is claimed here.

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

A timeout or unrecognized response retains the lock and reservation. Retrying
this same session DELETE changes only its terminal session state, never creates
a session or moves money. Another capture/refund operation's lock is never
replaced. Orders with known authorization use the existing verified void journal;
`finalizeWorldlineVoid(orderId,transactionId)` provides the shared cancellation
and reservation-release boundary after a confirmed void. A payment already
captured is not canceled or released as unpaid.

Managed checkout cancellation with an existing authorization first expires the
window. The paired managed callback recovery adapter owns its permitted void.
An unknown create-session result without a saved token can still be canceled
when a signed callback has linked the provider transaction: cancellation uses that
verified authorization and the original pinned account, with no invented token.
Managed authorization cancellation uses its dedicated callback-scoped permit.
Without either a token or linked transaction, the due job backs off for operator
reconciliation; it never invents a token or starts a replacement payment.

## Recovery

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
  pre-capture/captured cases.
- `node tests/unit/worldline-expiry-queue.cjs` — durable due selection beyond 50
  terminal orders, error backoff and scope isolation.
- `node tests/unit/worldline-stale-holds.cjs` — scope/age selection, unknown-state
  preservation, deadline and bounded attempts.
- `node tests/unit/native-free-checkout.cjs` — exact free-order eligibility,
  opaque proof/print boundary, mutation rejection and proof lifetime.
- Existing `stale-discount-holds-210`, `cart-cancel` and
  `delivery-checkout-cancel` regression suites, plus TypeScript typecheck.

The actual Worldline sandbox session-expiry and late-authorization behavior must
still be verified after manual key entry. Synthetic tests do not attest provider
runtime, merchant configuration, IAM or inbox/hardware behavior.
