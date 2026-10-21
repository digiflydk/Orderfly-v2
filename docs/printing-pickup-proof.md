# Staff pickup settlement origin (#337)

This server-only foundation is an independent prerequisite of #303. It adds no
production callsite, order/payment mutation, print-job insertion, API, transport or
activation. Existing `settlePaidPickupOrder` and held-checkout pickup acceptance
are unchanged. The latter needs a separate proof origin before integration.

## Inspected operational boundary

`src/lib/server/settle-checkout.ts` obtains `orderflySession()` server-side and
allows staff to record `cash` or `card` for native `PayAtPickup`/`Pickup` orders.
Its current transaction uses `authorizeTransaction(..., 'orderfly.orders:edit',
'location')`. Unpaid settlement requires an accepted order with a held discount
reservation. `paymentCollection` stores the receiving staff, timestamp and method.
Those operational staff permissions do not expose printer administration: every
existing printer administration surface remains platform-superuser-only.

## Opaque request origin, then current transaction preparation

`verifyPickupPrintPayment({ orderId, method })` accepts only a strict bounded
order reference and `cash`/`card`. It calls the existing trusted server session
helper, derives `principalKey(identity)`, and checks that the returned actor ID
matches. Client identities, permission arrays, raw session objects or paid flags
cannot mint a handle. The frozen process-local WeakMap handle serializes as `{}`.
It retains only the requested order/method, principal hash and server lifetime.
**It records an authorized staff request origin, not an actual collected payment.**

`preparePickupPrintTransition(context, proof)` requires the current Admin database
and the caller-owned native transaction. On every preparation, including retries,
it calls the server session helper again and requires the same principal. That
helper uses request-scoped verified identity caching and its existing account and
revocation semantics; this task does not change authentication or claim uncached
credential verification inside every transaction read. Current access grants are
never taken from session `permissions`: the actual `authorizeTransaction` reads the
current stored policy, principal, membership, role/company and native seller scope
in the caller's transaction. No separately opened transaction or caller identity
is used as settlement authority.

Preparation reads the native order, brand and location, checks document identity
and current native ownership, and rejects missing/deleted/malformed records. Only
`Received`, `In Progress` and `Ready` pickup orders are eligible. `Pending` payment
requires `discountReservation: 'held'` and no recorded collection; Paid replay
requires settled `consumed`/`none` reservation state (never held or missing),
an existing valid collection timestamp/principal hash and the same
recorded cash/card method. An unaccepted `Pending` production status, terminal
status, online/other payment method, non-null PSP, failed payment or inconsistent
collection rejects. Recognized refund markers `refundedAmountOre`, legacy
`refundedAmount` and `refundedAt` accept only absent or zero amounts and absent/null
timestamp. Partial/full refunds and malformed markers reject. This deliberately
fails closed for legacy Paid orders lacking a valid collection record.

Selected raw identifier/status/collection strings are length-bounded before Zod
regex/date refinements. Sparse array values fail type checks without traversal;
unknown customer/provider fields are not serialized into the preparation. Output
contains only immutable native kitchen order scope/state, prior payment state,
replay flag and collection method. It omits staff/contact/provider data.

Origins expire after five minutes. Every preparation (before and after awaited
reads) and projection observes server time. Expiry, invalid time or observed
backwards movement permanently invalidates the origin and all sibling handles.
Moving the clock back into the TTL cannot revive them. Context-bound projection
rejects fabricated/serialized/cross-module/cross-attempt handles.

## Limits and integration requirements

Context identity is not freshness, write authority, payment collection or commit
proof. The Firestore SDK may reuse its native Transaction object on retry; callers
must use a fresh callback context and rerun preparation inside every attempt.
`pickupPrintTransitionProjection` only checks that context identity and lifetime.
It does not reread grants or authorize a later write. No outbox helper accepts its
projected Paid state as persisted state. The future trusted atomic adapter must
compose actual staff settlement/order writes and one combined queue delta with all
reads before writes, shared 500-write application budget, explicit default-off
target policy and revision-0 replay deduplication. No post-commit enqueue gap is
introduced because there is no callsite or write in this task. #303 stays open.

## Validation and release

Run `npm run typecheck` and:

```
node --test tests/unit/printing-pickup-transition-proof.cjs tests/unit/printing-stripe-transition-proof.cjs tests/unit/access-authority.cjs tests/unit/printing-domain.cjs
```

Tests execute this module and the actual native transaction authorizer with only
session and Admin I/O isolated. They cover successful staff requests, opaque proof
forgery/serialization, native grant revocation, changed actor/session, order/seller
identity/ownership, lifecycle/reservation/collection/refund rejection, replay,
retry with reused SDK transaction object, irreversible time failures, raw text
bounds, sparse arrays, immutability, zero writes and absence of private fields.
The dedicated pickup-origin test step is added once to the existing UI test
workflow without permission changes. No browser flow changes in this internal
slice. Fixture success is not live staff/payment/write acceptance or physical
output. Root #309 coordinates fresh-main/current-head CI, actual independent
Codex review, serial merge/deploy and applicable read-only live verification.
Configuration writes/output remain default-off; authenticated live acceptance and
hardware testing remain separate blockers, never reported as passed here.
