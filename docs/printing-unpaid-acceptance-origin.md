# Unpaid pickup: the actual acceptance origin (#491)

This first bounded child of #343 extracts the existing checkout acceptance writer.
It does not enqueue a print, enable output, accept payment, or complete #350.

## Actual authority and callsite

`src/app/checkout/actions.ts` still validates the public checkout, creates the
Pending order without overwriting an existing reference, and commits the capacity
hold. Only its existing pickup branch calls
`preparePickupCheckoutAcceptance(context, { orderId, brandId, locationId, selection })`
inside the existing `firestore-compat.runTransaction` callback. The second callback
argument is #323's actual native context, freshly constructed for each SDK attempt.
The returned fixed plan is immediately applied; the response stays the same
confirmation URL with the existing scoped receipt token.

`src/lib/server/accept-pickup-checkout.ts` is server-only, outside the `use server`
action module. No new remotely callable action or HTTP endpoint is exported. The
actual writer owns its native reads, exact two writes, and capability. There is no
separate verifier that turns an arbitrary order reference, submitted identity,
accepted/Paid flag, projection, or callback into acceptance authority.

The service rereads the current order and location in the caller's transaction.
It requires matching native IDs/scope, an undeleted Pending/Pending PayAtPickup
Pickup order with its committed held reservation, no PSP, collection or refund,
and the current location's pickup/payment/fulfillment eligibility. Additional
fields never replace native authority. Native transaction conflict detection and
retry provide current-state protection; no invented order revision is stored.
The selected slot is recomputed using the existing fulfillment helper.

Brand and location IDs keep the existing public checkout identifier contract:
nonempty strings up to 160 characters excluding `/`, backslash, `?` and `#`. Dots,
Unicode and lengths above 128 remain valid, including when print intents are OFF.
The generated order ID retains its separate internal ASCII/128-character bound.
Both command and stored-field raw string bounds run before schema regex checks;
the native scope equality checks remain unchanged.

The fixed plan updates Received status, accepted/updated server timestamps and
fulfillment, then writes the existing deterministic `pickupReceived` notification
with a server event ID. Its write count is exactly two. It never creates an invoice,
collection, queue, original print manifest, delivery, activity record, or flag.
All reads finish before apply; an apply or commit failure must escape the current
native transaction so both writes roll back. A failed apply invalidates the plan.

Known payment/slot rejection messages and `pickup_order_rejected` preserve the
checkout's definitive rejection/release branch. Native read/commit failures are
not relabelled as definitive rejection: a lost acceptance outcome still retains
the original hold/unknown-outcome handling. Existing checkout-attempt idempotency
owns repeated customer submissions; this origin does not reaccept Received or
Paid rows or repair notifications by replay.

## Opaque capability and its limits

The actual service plan creates a frozen process-local handle held in a private
WeakMap. `readPickupAcceptanceCapability` accepts only that exact handle and the
same native context, with a fresh check of the native DB binding and its lifetime.
Forged/serialized/cross-module/cross-attempt handles fail. The returned frozen
projection contains only kitchen scope/state, exact write reservation, literal
`replay:false` and whether the two fixed writes have been queued in this attempt.
It contains no customer, receipt token, staff identity, credential, capability or
physical-output grant. Applied does not mean committed. A discarded transaction
attempt cannot be used as proof that acceptance persisted.

The lifetime is five minutes of server time, matching the existing internal
transition-proof convention. Expiry, clock reversal and invalid server time
invalidate the handle permanently. Every retry must construct and apply a new
plan from current snapshots; callers must not retain plans outside the callback.
The capability is not returned by the public checkout action.

## Required follow-up for original jobs

The future acceptance-to-print slice must compose this **actual** write plan with
the reviewed policy, native catalog, saved routing and one closed outbox plan,
within this same native transaction and before any apply. Reserve both acceptance
writes plus the canonical original manifest and every job/ledger write against the
shared 500-write limit. After the fixed acceptance writes are queued, the outbox
must assert the genuine handle's applied state before its own writes. No exported
arbitrary mint or supplied next-order DTO can replace that source.

That producer must create the canonical original manifest used by #350 together
with jobs and ledgers. Historical accepted orders lack this guarantee. Missing
manifests, timestamps, current routing, authentication or absence of current
target jobs cannot establish that no earlier kitchen print exists. #492 therefore
keeps enabled staff settlement with no canonical manifest fail-closed until the
actual producer and history policy are separately reviewed. No outbox/writer
integration or historical backfill is implemented here.

## Verification and release

Dedicated tests execute the real service with only native Admin persistence I/O
isolated, including scope/state/configuration changes, forged handles, all reads
before writes, exact write count, immutable projection, expiry, discarded attempts,
late write failure and rollback. Actual checkout tests load this real service and
exercise successful acceptance, configuration revocation after reservation and
unknown-outcome behavior. Existing merchant payment assertions remain intact.
The identifier regression first reproduced an ordinary print-OFF checkout
rejection, then verifies actual checkout acceptance with dotted and 129/160-character
tenant IDs, plus checkout/native rejection of separators and overlong IDs.
These in-memory transaction contracts are source tests, not native emulator,
browser, production acceptance or physical-print evidence.

Run typecheck and `node --test tests/unit/printing-unpaid-acceptance-origin.cjs
tests/unit/merchant-payment-methods.cjs`, plus affected checkout regressions.
Root owns publication, shared CI registration, current-head independent Codex
review and serial merge/deploy. Claude owns final acceptance after verified
deployment. #343 and the complete unpaid acceptance-to-print flow remain open.
