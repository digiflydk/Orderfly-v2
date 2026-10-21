# Stripe origin proof for future print transitions (#327)

This is the first bounded prerequisite of #303. It adds no production callsite,
order mutation, outbox insertion, routing target, API, credentials or output.
Current settlement and the original outbox helper are unchanged. Staff pickup
payment and held-checkout pickup acceptance need separate proof-origin adapters.

## Inspected current flow

`src/app/api/stripe/webhook/route.ts` verifies Stripe signatures before calling
`settlePaidCheckoutSession`. `src/app/api/payments/confirm-from-session/route.ts`
retrieves a Stripe session server-to-server before settlement. The settlement
function currently accepts a raw `Stripe.Checkout.Session` with a caller contract;
that raw object is not a sufficient runtime provenance boundary for new printing
code. `settlePaidPickupOrder` obtains `orderflySession` and transactionally calls
`authorizeTransaction`; checkout pickup acceptance separately validates held
reservations and native seller configuration. Those origins must not be conflated.

The settlement Paid-replay branch can return before seller configuration is read.
The new printing preparation always reads native brand/location inside its own
caller-owned transaction, including when the order is already paid.

## New server-only boundary

`verifyStripePrintPayment(sessionId)` accepts only a bounded session identifier.
It retrieves the current secret through the existing server payment settings and
retrieves the session using Stripe's server client (five-second timeout, no SDK
retries). It requires payment mode, complete/paid state, DKK, positive safe integer
minor amount and valid native metadata. Metadata alone, a caller's session object,
client flags, a type assertion, or a serialized object cannot mint a proof.

Evidence is a frozen, process-local opaque handle tracked in a private WeakMap.
It contains no enumerable payment/customer fields. No proof is persisted, logged,
or sent to a browser. Provider/configuration errors are generic. Evidence expires
at five minutes and rejects backwards server clock movement.

`prepareStripePrintTransition(context, proof)` uses a caller's native transaction
context from the compatibility bridge or native server callback. The database
must be the server's current Admin database. It reads the order, native brand and
native location using that transaction. It requires matching native ownership,
stored Stripe session identity, amount and eligible nonterminal order lifecycle.
Canceled/completed/refunded/foreign/missing or malformed orders fail closed.
Paid/Pending inconsistency is rejected. Evidence age is checked before and after
reads. A Pending payment projection derives Paid and Pending status derives
Received. Already-paid replay keeps the current production status and order ID.

The returned handle has a second private runtime map, bound to the exact callback
context object. `stripePrintTransitionProjection` rejects fabricated, serialized,
cross-module-instance, expired or different-context handles. Its projection is
frozen and excludes payment credentials, customer data and provider payloads.

## Limits and subsequent integration

A context identity check is **not** freshness authority, authorization of a write,
or proof that a transaction committed. The Firestore SDK may reuse a Transaction
object on retry. Future callers must use the fresh callback context from #323 and
rerun preparation inside each attempt, never retain a prepared handle outside the
callback or construct its context once outside a retry. A current internal server
caller is trusted to supply a real native transaction; this module is not an
HTTP/client authorization API. Opaque maps protect against forged evidence, not
malicious code with Admin database privileges.

No existing helper accepts this projection as persisted order state. A follow-up
must integrate verified origin and revalidated native reads with the actual order
mutation and ONE combined outbox/queue delta in the same transaction, retaining
all-read-before-write order and the shared 500-write application budget. It must
also implement explicit default-off target/intent policy, staff/pickup origins,
replay deduplication and actual caller wiring before print intent can be created.
This prerequisite does not close #303 or prove atomic end-to-end printing.

## Validation and release

`node --test tests/unit/printing-stripe-transition-proof.cjs` executes the actual
module with only external Stripe/Firestore/settings I/O replaced. It covers
runtime origin forgery, invalid provider state, unavailable keys/provider,
native/session/amount/lifecycle mismatches, replay, expiry/clock movement,
context separation, retry revalidation, immutable data projection and zero writes.
Run `npm run typecheck` and affected printing/transaction regressions. There is no
new UI flow requiring browser fixtures. Coordinator adds this dedicated unit suite
to shared CI, serializes fresh-main exact-head CI and independent Codex review,
then verifies deployed release and applicable read-only boundaries. Internal
fixture success is not production invocation, physical output or logged-in QA.
All admin surfaces remain superadmin-only; all existing write/output flags remain
unchanged and off. No production data/rules/index mutations are required.
