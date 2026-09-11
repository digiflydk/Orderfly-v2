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
