# Provider-bound delivery payments and native free checkout

PR #914 keeps Stripe and Worldline as separate payment providers. A Worldline
transaction never becomes a Stripe session, intent, charge or refund object.

## Managed checkout and settlement

The authoritative checkout price and any accepted Wolt quote are resolved before
merchant credentials. Positive managed payments require the payment environment
to match the managed-delivery environment. The selected Worldline binding is the
order's immutable `paymentAgreement`; `managedStripeAccount` belongs only to
Stripe orders. Stripe legacy credentials are archived by the shared resolver so
new legacy orders also retain their original account.

`delivery/payments/payment-authority.ts` is the provider-neutral consumer boundary.
It delegates Stripe validation to the existing Stripe authority and independently
reads Worldline's transaction with the original pinned credentials. Projections
use `paymentReference` and `checkoutReference`; provider-native IDs retain their
meaning. The fresh process-local proof binds scope, account, amount, managed quote
binding and, for Worldline, the payment revision and absence of another financial
operation. Consumers revalidate the persisted order in their own transaction.

A captured managed Worldline order settles the existing financial plan, invoice,
capacity, discounts and loyalty exactly once. It stays `Pending` with a durable
delivery-dispatch job. Only successful native courier acceptance changes it to
`Received`, enqueues confirmation and creates the original kitchen print intents.
Unknown courier outcomes never authorize a refund or a new courier request.

## Private capture and cancellation permits

`worldline-operation-authority.ts` owns a private WeakMap. Only its fixed worker
wrappers mint permits; plain objects and ordinary administration/customer calls
cannot authorize managed financial operations. The root financial journal calls
`assertManagedWorldlineOperation` inside the claim transaction. The validator
rechecks the callback job, scope, transaction, frozen account, amount, revision,
state and fixed operation identity before any mutation.

Capture uses the existing `initial-capture` journal identity. A retry must reconcile
that journal even when provider capture is already complete, so a failed local
final commit cannot strand a locked order or create another capture.

A known signed callback authorization can be canceled even when the hosted-session
creation reply was lost. The fixed managed cancellation wrapper verifies zero
capture, then atomically records `Canceled` with
`worldline_authorization_cancel_requested` and a revision increment before minting
a void permit. It never fabricates session-expiry evidence. An existing capture
lock prevents this transition. A late authorization after confirmed session
expiry is likewise voided; captured money requires reconciliation rather than
being treated as an unpaid cancellation.

## Courier rejection compensation

The existing native dispatch-rejection evidence remains mandatory. Worldline
compensation uses the durable `deliveryRefunds/original` ledger and an order-level
`delivery-refund:<key>` lock before sending one Europe `credit` request. This lock
excludes the generic journal. A timeout or missing readback keeps the ledger and
lock uncertain; the next heartbeat performs only provider reads. It never repeats
the credit request blindly.

Only full verified provider credit atomically commits the refund total, canceled
order state, customer-spend adjustment and financial adjustment. Worldline ledger
and adjustment records contain `provider: worldline` plus the native
`paymentReference`; they have no fabricated `paymentIntentId`. Pending or rejected
credit is not recorded as refunded money. Terminal ledger results are monotone
under concurrent workers.

## Durable recovery queues

Worldline payment jobs use the automatically indexed `nextAttemptAt` field:
`where(nextAttemptAt <= now).orderBy(nextAttemptAt).limit(1)`. Each failure moves
that job forward with bounded exponential backoff; later due jobs remain reachable
behind permanent failures. Settled/canceled jobs move out of the due range. One
job per heartbeat bounds the provider I/O within the existing worker lifecycle.
The callback admission transaction must initialize `nextAttemptAt` and `attempts`.

Order creation also creates `worldlineCheckoutExpiryJobs/<orderId>` in the same
transaction, due after 31 minutes. This survives loss of the session-create reply.
Session/authorization recovery is handled by the dedicated expiry module; a
missing token is never permission to start another payment session.

## Native zero-total checkout

An exact 100% discount-card order with zero fees uses `paymentMethod: Free` and
`freeCheckout: {version: 1, kind: discount_card}`. It has no PSP or merchant
agreement and resolves no payment credentials. `native-free-checkout.ts` verifies
the persisted authoritative arithmetic and mints a distinct process-local proof.
The existing financial plan and a private Free print capability provide the same
atomic accounting and replay protection as paid checkout.

Managed delivery still requires a strictly positive online total. A zero-total
managed cart is rejected before any order, quote consumption or provider key
resolution. Ordinary pickup and unmanaged delivery can use native Free checkout.

## Local validation

Synthetic tests cover managed Worldline checkout/environment isolation; provider
capture, accepted-courier print, compensation, unknown results and duplicate
workers; forged/stale permits; callback queue starvation and capture-journal
recovery. Existing Stripe delivery refund, dispatcher and acceptance tests remain
regression gates. No test creates a real Wolt delivery or Worldline transaction.

Actual Worldline sandbox acceptance and runtime credentials are separate. The
`ORDERFLY_WORLDLINE_LIVE_ENABLED` gate remains default-off; this source change does
not configure credentials, activate production payments or verify physical
printing/courier behavior.
