# Orderfly — System Architecture Overview

This document provides a unified overview of how the frontend, server actions, APIs, and Firestore interact in Orderfly v2.

## System Context (Mermaid)
```mermaid
flowchart LR
  subgraph Client
    A[Customer Webshop\n/ [brand]/[location]]:::box
    B[Superadmin UI\n/ superadmin/*]:::box
  end

  subgraph Next.js App Router (v15)
    C[Server Components]:::box
    D[Client Components]:::box
    E[Server Actions\n(e.g. createOrUpdateProduct)]:::box
    F[API Routes\n/api/debug/all, /api/docs]:::box
  end

  subgraph Firebase
    G[(Firestore\nproducts,\nfeedbackQuestionsVersion,\nsettings/*, cms/*)]:::db
    H[Firebase Admin SDK]:::svc
  end

  A --> C
  B --> C
  D --> E
  C --> E
  E --> H --> G
  F --> H
  classDef box fill:#fff,stroke:#999,rx:6,ry:6;
  classDef db fill:#eef7ff,stroke:#5b9bd5,rx:6,ry:6;
  classDef svc fill:#f7f7f7,stroke:#aaa,rx:6,ry:6;
```

## Core Flows

* **Product Flow:** UI → `createOrUpdateProduct` → Firestore → Redirect
* **Feedback Flow:** UI → `createOrUpdateQuestionVersion` → Firestore → Redirect
* **Debug & Docs:** `/api/debug/all`, `/api/docs`, `/api/redoc`
* **Order entry:** `/` renders the marketing landing directly without changing the browser URL. Its **Bestil her** actions open the delivery-method modal and continue to `/esmeralda/esmeralda-pizza-amager?deliveryMethod={delivery|pickup}`, using the production Esmeralda Pizza brand and Esmeralda Pizza Amager location. `/m3pizza` remains an internally rewritten compatibility alias for the same landing, and `/m3pizza/order` remains a compatibility redirect that normalizes legacy `takeaway` to `pickup`. The shared `/{brandSlug}/{locationSlug}` route renders the Firestore-backed menu, product, cart and checkout flow. Confirmation pages resolve asynchronous route/query props, use the order ID with checkout-session fallback, verify that the order belongs to the requested brand/location, serialize Firestore timestamps before client rendering, and omit payment-provider identifiers from the browser payload. The retired `/m3pizza/m3pizza/m3-pizza-hellerup` preview route is not part of the public flow.
* **Promotion and Checkout Flow:** Standard discounts, entered codes, and newsletter-signup discounts are read from Firestore but revalidated by the checkout server action before an order or Stripe session is created. The server chooses the best cart-level discount, recalculates delivery, bag and administration fees, and sends the same total to the order and Stripe. Newsletter incentives are configured in the existing Discounts module with `applicationType = newsletter_signup`; consent and per-customer usage are checked server-side and usage is recorded by the idempotent Stripe webhook. Upsells are filtered by brand, location, delivery method, schedule and cart trigger, suppress products already in the cart, and are shown at most once per browser checkout session.

## Architecture Principles

* Next.js App Router (v15) with Server Actions
* Firestore as single source of truth
* Swagger & Debug routes for testing and operational visibility

### Promotion review corrections (#40)

Cart-level eligibility resolves product and combo records in the requested brand/location. Combos, active item offers and items sold below catalog price are excluded. Legacy offer suffixes resolve back to the native product ID. Checkout payloads must carry the item ID; old open checkout tabs must refresh.

Customer assignments use brand-filtered `customers` IDs; legacy assignments to administrative users must be reselected. Discount and upsell schedules use `Europe/Copenhagen`, including DST. A newly consenting customer retains a pending newsletter discount ID until successful use, allowing canceled-payment retries; paid usage still blocks reuse. Payment status, customer aggregates and discount counters commit in one Firestore transaction, so failures roll back all required fulfillment work.

Focused regression command: `node --test tests/unit/promotion-review.cjs` (no browser or production writes).

### Concurrent redemption and deleted records

Before issuing a discounted Stripe session, checkout reserves global, per-customer and first-order capacity in a Firestore transaction. Fixed-size customer, discount and customer/discount capacity documents retain held and paid counters independently of deletable admin records. Fulfillment consumes the hold and updates paid counters together with the order. Missing customer/discount records are skipped, recorded in `fulfillmentWarnings`, and never recreated; existing records from another brand still reject processing.

Stripe sessions expire after 31 minutes. The webhook must receive **checkout.session.expired** as well as **checkout.session.completed**. Only verified Stripe expiration releases a payable-session hold; visiting the cancel URL does not. Failures before the session request release the hold immediately. Ambiguous Stripe request failures retain capacity: operators must reconcile the order-ID idempotency key with Stripe before releasing it, never release merely on elapsed wall time. Active holds count until expiration delivery even when the webhook is delayed.

The regression suite covers two competing reservations, global/per-customer/first-order limits, release, duplicate fulfillment, rollback/retry and customer/discount deletion during checkout.

### Explicit cancellation

New Stripe cancel URLs carry an unguessable, order-specific capability. Only its SHA-256 hash is stored on the order. Returning through Stripe cancellation calls a server action that validates the capability and Stripe metadata, expires the open session, and releases capacity only after confirmed `expired` status. Completed payments never release capacity. Transient failures show a retry state rather than claiming cancellation succeeded. Pre-existing sessions without this capability keep the expiry-only behavior. Cancellation tests include invalid capability, provider failure, payment races and retries; no live Stripe writes are part of the unit suite.

### Final concurrency and identity corrections

Every checkout reserves customer capacity, including undiscounted orders. First-order promotions exclude all concurrent sessions in either creation order. Cancellation and expiry release that capacity too. The former brand-wide ledger is replaced before release by hashed, tenant-scoped documents in `checkout_customer_capacity`, `checkout_discount_capacity` and `checkout_customer_discount_capacity`. Each stores only numeric held/paid counters plus a customer first-order flag; order documents retain reservation state. No brand-wide customer history map is rewritten at payment. This replaces an unreleased PR schema; any environment running a prior PR snapshot must reconcile outstanding old holds before upgrading.

Checkout first resolves a brand-scoped normalized email to the native customer document, including integration-created IDs. Ambiguous duplicates fail explicitly. Upsell history retains a set of every handled offer ID and reads the legacy single-ID value. Regression suite: nine tests, including mixed first-order/ordinary session rejection in both directions and native integrated-customer resolution.

### Checkout availability follow-up

Review corrections: server `getTimeSlots` and the browser compatibility entry point share `src/lib/time-slots.ts`. The Change dialog sends calendar dates independently of browser timezone, ignores superseded requests, and permits saving only a current returned option. Past-date queries return no slots. Newsletter discovery waits 500 ms after a syntactically valid address settles; cleanup cancels pending timers and suppresses obsolete responses. Focused tests exercise the actual dialog with the actual server action and mocked storage, plus rapid email edits and stale replies. Sixteen targeted tests pass; no full browser suite is required for this follow-up.

Newsletter offer discovery now resolves the entered email with the same tenant-scoped customer lookup used by payment. Returning customers can receive an incentive only if campaign rules permit; first-order-only, previous consent and paid-use restrictions remain enforced. Changing email or losing eligibility clears the newsletter discount without clearing an unrelated manual code. Checkout transport errors always reset the processing state. Payment revalidates eligibility; discovery is not authorization. Outstanding Stripe reservations are never released by this UI change.

Default time calculation uses Copenhagen's calendar day, excludes expired same-day slots, and advances each fulfillment method independently to its next usable opening when preorders are enabled. Unconfigured preparation and delivery durations default to 20 minutes each; configured overrides are retained. Closed days are skipped and labelled with their actual date. Explicit calendar-date queries do not silently substitute another day. Focused verification: `node --test tests/unit/checkout-availability.cjs tests/unit/promotion-review.cjs` and `npm run typecheck`. These tests use mocked persistence, not live Stripe payments.

### Feedback and transactional notifications (#102)

Feedback question versions remain reusable definitions. A version is either a platform `default` or belongs to one `brandId`; legacy versions without scope remain defaults. `feedbackSettings/{brandId}.questionVersionId` can explicitly assign an active, language-compatible default or same-brand definition. Without an explicit assignment, resolution prefers that brand's active version and falls back to the deterministic platform default. Public rendering and submission use the same resolver, and submission rejects a forged active version assigned elsewhere.

A completed paid order can create an idempotent feedback invitation. Its signed link is generated only while the worker prepares the message. A reply consumes the invitation transactionally and suppresses any pending reminder. Moderation writes a separate public projection; the website never reads private feedback or customer documents.

Paid checkout settlement creates one `orderNotificationJobs` confirmation job in the same Firestore transaction as payment/customer/discount settlement. The feedback worker endpoint processes both confirmation and feedback outboxes. It sends a narrowly scoped request to the central mPanel notification queue with the `orderfly` sender profile and an allow-listed template key. Provider acceptance means queued by mPanel, not delivered by Mailtrap. Timeouts after dispatch remain uncertain and are never resent blindly.

The private worker endpoint accepts either its dedicated worker secret or the existing shared mPanel integration secret. This lets mPanel's already scheduled notification worker provide the heartbeat without adding another scheduler. Both values remain server-only, and invalid or short values are rejected before any Firestore work.

The mPanel endpoint, organization ID and machine secret are runtime configuration. Secrets, recipients and signed feedback links are never returned in admin job listings or logged. The coordinated mPanel implementation is tracked in `digiflydk/esmeralda-restaurant-operations#262`.
