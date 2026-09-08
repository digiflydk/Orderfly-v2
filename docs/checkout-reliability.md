# Complete Order reliability (#60)

## Evidence and scope

The investigation started from main `40ef3aa8a4d04744968254d2d4bbdf7af2162b82`
(merged #59). Read-only Firebase App Hosting logs inspected on 2026-09-07 showed
checkout failures at 09:49:56 and 09:50:09 caused by the absent
`paymentDetails.cartDiscountName` field, plus earlier first-order reservation
rejections. The recursive optional-field fix is already in this base; the log
entries alone do not identify the currently deployed revision. See
[the original persistence incident](checkout-optional-fields.md).

Code inspection also found independent checkout blockers: rejected/hanging
upsell lookup, awaited conversion statistics, malformed analytics cookies,
unavailable browser storage, an unnecessary Stripe.js/publishable-key gate,
uncaught discount lookup failures, and optional consent linkage aborting customer
creation. These are addressed without disabling required price, discount or
restaurant checks. Internal loyalty and the separate #57 security scope are not
changed by this PR.

## Customer flow

- Hosted Checkout renders after the cart is restored. It needs the server secret
  and returned payment URL, not a client publishable key or Stripe Elements.
- Optional upsell lookup has a two-second fallback. Late lookup results are ignored.
  Conversion tracking never holds the dialog open. Accepting an offer returns to
  the refreshed basket; skipping it validates the customer form again.
- Payment uses `POST /api/checkout/session`, bypassing Next's client Server Action
  queue. The route requires a same-origin JSON request, caps streamed bodies at
  128 KiB, validates customer details/terms and forwards to the existing checkout
  action with its server price and restaurant checks.
- Every mounted payment attempt generates a random 256-bit idempotency key.
  A Firestore transaction in `checkout_attempts` claims that key before creating
  an order. Concurrent requests return pending; completed repeats recover the
  cached result. A changed request with the same key is rejected. Document IDs
  and result encryption keys use different SHA-256 domain prefixes. Cached
  results (including payment URLs) use AES-256-GCM; the raw key is never stored.
  Transport retries reuse the same key and body, with a 20-second request timeout,
  at most two network retries and a 60-second recovery window. They never re-run
  a claimed order operation. A cache write failure retries only that write and
  still returns a known payment URL to the original caller.
- An in-memory request guard prevents concurrent submits, including two clicks
  before React renders. The form is disabled while processing and displays
  `Opening payment…`. After 15 seconds it explains that the request is still being
  checked; it does not start a competing payment request.
- Required fields and delivery address failures appear persistently beside the
  payment button. Discount validation has an eight-second read-only fallback and
  always releases its processing lock.
- Analytics, session storage and optional cookie-consent lookup cannot block
  payment. Customer persistence remains mandatory. No consent is inferred when
  optional linkage fails.
- Navigation uses the returned hosted Checkout URL. If navigation is interrupted,
  the existing Complete Order button retries that same URL without another checkout
  request. There is no separate continuation link. Customer details, terms, time,
  discounts and bag controls stay locked to the existing payment snapshot.
- Menu cart amounts exclude the bag fee on desktop, the mobile drawer and the
  floating mobile button. Checkout shows the configured bag fee and includes it
  unless the customer removes the bag. See [presentation QA](menu-cart-presentation-65.md).

## Server and reservation safety

| Outcome | Behavior |
| --- | --- |
| New order reference collides | Transaction refuses to overwrite the existing order; no Stripe request |
| Failure before session creation, including lost reservation response | Release any committed hold for this order; allow retry only after successful cleanup |
| Confirmed Stripe 400/401/403/404/429 rejection on the first outbound request | Release the hold; permit retry |
| Network/5xx/idempotency conflict, explicit retry hint, or 4xx after an SDK retry | Preserve hold; return an uncertain result |
| Session created, first link write fails | Retry the same idempotent link write once |
| Link writes fail, or Stripe returns no URL | Expire the known session; release only after Stripe confirms expiration |
| Expiration or release cannot be confirmed | Preserve safety and return an uncertain result |
| Success | Return the known session URL and order reference |

Stripe uses a 15-second timeout per request and two SDK retries with the same
idempotency key and parameters. The request event count matters: a later 429 may
be returned before the idempotency layer even if an earlier request created a
session. It is not proof that the earlier session is non-payable.

Card Checkout sends only a valid `statement_descriptor_suffix`. Stripe documents
that `payment_intent_data.statement_descriptor` is invalid for card charges in
[the Checkout Session API](https://docs.stripe.com/api/checkout/sessions/create).

Failures emit `checkout_failed` with stage, order reference when reserved, safe
error code and retryability. Customer details, API keys and payment URLs are not
included in these diagnostics. Existing signed expiration/completion webhooks
remain responsible for asynchronous reservation reconciliation.

An uncertain response locks this mounted form and asks the customer to contact
the restaurant. The HTTP attempt record allows recovery of a lost response during this attempt.
The browser key is not persisted across reloads/devices, so this change does **not**
add payment recovery after such navigation, nor prove that an external outage can always be
recovered automatically. Operators must inspect the referenced order/session;
never manually release a hold merely because a request timed out. Reservation
expiration remains the existing 31-minute Stripe session lifetime when the outcome
is unknown. This is not a double-payment guarantee across separate tabs/devices.

## Focused local verification

No Actions, broad Playwright suite, production database writes or real Stripe
charges are part of these checks.

```sh
npm run typecheck
node --test tests/unit/checkout-session-persistence.cjs tests/unit/checkout-reliability.cjs tests/unit/checkout-price-validation.cjs tests/unit/checkout-route.cjs tests/unit/checkout-attempt.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/checkout-browser.cjs
```

Results: TypeScript passed, 57 server/HTTP cases passed and 16 local Chromium cases
passed. Server cases execute the actual action, price checks and (for capacity
scenarios) reservation functions against a strict in-memory Firestore fixture.
The browser fixture bundles the actual checkout component, React Hook Form/Zod,
UI controls, analytics provider and upsell dialog; server I/O is simulated, including a blocked optional Server Action queue and
lost/repeated HTTP responses. Separate tests exercise the actual route and
transactional attempt guard, including encrypted result recovery and body/origin
rejection.

Two selected browser cases were also run against the original main sources using
`CHECKOUT_BASELINE=40ef3aa8a4d04744968254d2d4bbdf7af2162b82` and
`--test-name-pattern '^(upsell-error|cookie):'`. Both failed to reach payment on
that baseline and pass with the fix. These are regressions, not live payment
evidence. The browser fixture is isolated. Actual App Hosting proxy/origin handling and
Stripe network responses still require post-release verification.

## Work Release / QA handoff

Independent review and PO acceptance precede merge. Publish the tested tree with
`[skip ci]`; no Actions should be manually dispatched. After release, verify the
actual App Hosting revision includes both the optional-field fix and this change.
Then use an explicitly controlled QA test order to verify hosted Stripe opens,
cancel releases the discount and preserves the basket, and a completed test
payment produces a paid receipt for the same restaurant and exactly one order.
Inspect `checkout_failed` and signed webhook outcomes. Production deployment and
that controlled payment verification remain pending; do not mark #60 Done from
local tests alone.

## P1 follow-up from #67

See [commerce P1 corrections](commerce-p1-67.md) for receipt capabilities, truthful
payment states, shared settlement, current fulfillment/catalog validation,
preserved combo selections and the shared menu upsell fallback. That document
contains the current release and targeted QA contract for these changed paths.

## Commerce audit #67

The coordinated P1/P2 release is documented in [commerce-p1-67.md](commerce-p1-67.md)
and [commerce-p2-67.md](commerce-p2-67.md), including integer-øre pricing, scoped
read caching, optional telemetry and the exact-release QA handoff.
