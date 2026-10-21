# Orderfly printing

## Current delivery: domain foundations (#291)

`src/lib/printing/domain.ts` defines scoped printers, print jobs, stable job identity
and production eligibility. It does not create database records, expose endpoints,
change checkout, connect to a broker or print. No browser/iPad is needed by the
planned server-to-printer architecture. Physical QA belongs to the final pilot.

Initial printers are Star mC-Print2 and mC-Print3. HTTP CloudPRNT is the compatibility
path. MQTT requires checking the exact mC-Print3 variant and firmware against
[Star's compatibility table](https://star-m.jp/products/s_print/sdk/StarCloudPRNT/manual/en/index.html).
Do not infer MQTT support from the mC-Print3 family name or overwrite Wolt settings.

## Trigger integration points (not wired yet)

- `src/app/api/stripe/webhook/route.ts` verifies Stripe's signature and calls
  `settlePaidCheckoutSession` in `src/lib/server/settle-checkout.ts`.
- Settlement atomically transitions payment to `Paid` and a `Pending` order to
  `Received`. It already writes `orderNotificationJobs` in the transaction.
- `src/app/checkout/actions.ts` accepts pay-at-pickup orders in a transaction only
  after the capacity reservation is `held`; it writes `Received`, `acceptedAt`
  and the `pickupReceived` notification job together.
- A future print outbox must be committed with those accepted transitions, with
  all transaction reads before writes. Do not rely on a browser success page.
- Later payment of a pickup order must reuse the original kitchen job identity.
  Receipt/payment events must not start another kitchen production.

Eligibility currently allows `Received`, `In Progress` and `Ready` orders only.
Stripe requires persisted `Paid`. Pay-at-pickup requires pickup fulfillment, no
PSP record and either an accepted unpaid `held` reservation or paid state.
Pending, canceled, error, completed and delivered orders fail closed. This is a
production gate, not authorization: callers must load authoritative server data,
authorize the actor and validate brand/location membership before invoking it.
Paused/disabled printers and mismatched brand/location fail closed.

Job keys hash a versioned JSON array of brand, location, order, printer, bon kind
and explicit revision. Original production uses revision 0. Keys do not depend on
payment provider events or payment state. The future transactional create/claim
must enforce uniqueness; the pure key function alone does not guarantee delivery
or exactly-once physical output. Unknown print outcomes must not be blindly retried.

## Following bounded deliveries

Each work item has at most 60 minutes of active work, its own issue/PR, explicit
acceptance criteria and handover. Split before expanding scope.

1. Validated printer configuration and authenticated scoped persistence/API.
2. Transactional print-intent outbox and tests for payment/pickup idempotency.
3. Printer management UI with overview, add/edit/pause/deactivate and test preview.
4. Category/product routing and per-station bon data/preview.
5. CloudPRNT HTTP adapter and protocol simulator.
6. MQTT adapter, status and reconnection (compatible hardware only).
7. Deployment and feature-specific live QA for each exposed capability.
8. Physical pilot with both printers, Wolt coexistence and failure recovery.

Actual production printing remains disabled until the pilot. Code/UI deployment
does not depend on physical printer availability.

## Verification and release

Run `node --test tests/unit/printing-domain.cjs` and `npm run typecheck`.
There is no changed browser flow in this delivery.
Follow `AGENTS.md` for current-head CI, independent Codex review, merge and release
verification. PO/PM has authorized qualifying merge/deploy without another prompt.
After deployment verify `/api/health` release and run issue-specific live QA for
exposed features. For these unconnected internal foundations, record that there
is no live domain endpoint yet; local tests are not live end-to-end evidence.
Do not mark final print acceptance as passed until actual printer output is proven.
