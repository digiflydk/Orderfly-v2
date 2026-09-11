# Omnisend paid-order events (#119)

## Contract

After Stripe verifies payment, Orderfly atomically creates one deterministic
Omnisend outbox job when the brand-scoped customer has explicit email-marketing
consent and the customer/order email agrees. Checkout and invoice never depend
on Omnisend availability.

The worker first completes normal contact-consent sync, then processes up to ten
order jobs. It revalidates tenant ownership, paid and non-canceled state,
customer consent and the synced Omnisend contact. The native request uses
`POST /api/events`, event name `paid for order`, origin `api`, version `v2`, and
invoice-backed currency amounts. Address, phone, analytics attribution and
referrer data are excluded.

The deterministic Firestore document prevents duplicate jobs. Provider 429
responses can retry with bounded backoff. A timeout, connection failure or 5xx
after dispatch has an unknown outcome and becomes terminal `uncertain`; Omnisend
documents that real-time automation events are not deduplicated, so operators
must investigate rather than resend blindly.

## Safe deployment and activation

The committed App Hosting configuration sets `ORDERFLY_OMNISEND_PAID_ORDERS_ENABLED`
to `"false"`. This separate switch leaves existing newsletter contact sync intact.
While disabled, payment settlement does not read or create marketing order jobs,
the order worker performs no outbox query or provider request, and admin order
listing/retry is disabled. Invoice and transactional confirmation still run.
Deploying this dormant feature is safe before its infrastructure prerequisites;
**live activation remains blocked until every prerequisite below is verified**.
Set the runtime value to `"true"` only in a subsequent reviewed deployment after
recording the rules/index and mapped-key evidence. Disabling it again pauses
creation and dispatch without deleting or replaying any jobs.

Payment settlement uses Firebase Admin SDK references and transactions, including
the existing bounded discount-reservation counters. Therefore deny-all client
rules on the private outbox cannot break verified payment settlement. Brand,
location, customer, session and existing-job scope checks remain enforced.

Contact lookup uses the canonical `contactKey` from the consent store. Pending or
retryable failed contact sync defers order dispatch. After provider brand
verification, a transaction rereads order, customer, contact and job before the
dispatch transition, so intervening consent withdrawal or cancellation suppresses
sending. Both workers share a 100-second request deadline, with provider time
reserved before starting further jobs.

## Release prerequisites

1. Merge and deploy Orderfly PR #118 first; this PR depends on its immutable
   invoice and verified funnel settlement.
2. Preserve the existing server-only `ORDERFLY_OMNISEND_BRANDS` mapping and
   `ORDERFLY_MARKETING_WORKER_SECRET`. The Omnisend API key needs event-write and
   contact permissions for its mapped brand.
3. In data project `orderfly-39325`, deny all direct client access to
   `marketingOrderOutbox`; verify no permissive wildcard grants it indirectly.
4. Verify the composite index `marketingOrderOutbox: brandId ASC, createdAt DESC`
   and the ascending single-field index on `nextAttemptAt`.
5. Keep the authenticated periodic call to
   `POST /api/internal/marketing/sync`; the response now has separate `contacts`
   and `orders` counts.

## Controlled acceptance test

Use a synthetic customer in the intended Omnisend test brand. Confirm consent
sync reaches `synced`, then complete one paid test order. Verify exactly one
`marketingOrderOutbox` job reaches `accepted` and Omnisend shows one paid order
with the same order ID, invoice number, currency total and product quantities.
Repeat webhook/receipt confirmation and confirm no second job/event appears.

Complete a second paid order without newsletter consent. It must appear in the
Orderfly funnel and invoice records but must not create an Omnisend order job.
Cancel or revoke consent before a pending job runs and confirm it is suppressed.

Rollback is operational: disable the affected brand mapping or stop the worker
schedule. Preserve jobs for audit; do not delete or replay `uncertain` jobs.


## Regression verification

Run `node --test tests/unit/omnisend-paid-order.cjs tests/unit/payment-confirmation-job.cjs`
and `npm run typecheck`. Coverage executes the actual consent-store key lookup,
Admin capacity settlement and paid-order worker, including concurrent retries,
client-transaction denial, reservation counters, consent changes during provider
I/O, failed contact recovery, bounded deadlines and the default-off release gate.
