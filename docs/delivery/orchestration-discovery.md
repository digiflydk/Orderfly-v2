# Delivery orchestration integration findings

Scope: #657.23–.32. Inspected origin/main `dfae7f58260060cac2404a33eea6833bfa3d55f1`. This is a proposed integration sequence, not deployed behavior.

## Existing path

`src/app/checkout/actions.ts` creates a Pending order, reserves promotion capacity, then creates an automatically captured Stripe Checkout Session. The session has no manual `capture_method`. Its order reference is the Stripe idempotency key. The server already distinguishes definitive rejection from an uncertain request outcome.

`src/lib/server/settle-checkout.ts` settles a verified payment in a native transaction: Paid status, Pending-to-Received status, invoice sequence, customer totals, promotion settlement, confirmation and marketing outboxes. Printing preparation is part of the same transaction. Repeated Paid events avoid financial duplication but can repair missing confirmation jobs.

`src/lib/orders/terminal-status.ts` currently lets a paid Delivery order progress from Ready to Delivered manually. It queues feedback on Delivered. `terminal-read.ts` shows Received/In Progress/Ready paid orders on the board. It already projects delivery address and `customerDetails.deliveryInstructions`, although the checkout order construction currently only snapshots phone/address there.

## Proposed managed-delivery sequence

1. Validate and bind an immutable delivery quote to the authorized brand/location, cart, recipient/address and desired time before payment. Preserve legacy delivery and pickup paths unless the new feature is explicitly selected.
2. Persist a delivery booking intent together with the new managed order. No provider network call occurs inside a Firestore transaction.
3. Keep the existing automatic-capture financial settlement semantics, but for managed delivery atomically record payment settlement and a dispatch-ready durable outbox while withholding Received acceptance, order-confirmation outbox and original print. A paid but unbooked order must remain clearly pending delivery confirmation.
4. Worker atomically claims one immutable intent and commits `submitting` before external I/O. Stable provider reference and request digest never change on transport retry. A process crash after claim is uncertain, not evidence that no courier exists.
5. Confirmed provider acceptance advances independent delivery state and authorizes one-time order acceptance/confirmation/print through existing native pipelines. Repeated provider events cannot generate another original receipt or resend acceptance.
6. Definitive provider rejection starts an idempotent refund/compensation workflow. Record refund pending versus provider-confirmed refund explicitly. Do not invent payment-status enum values or reverse accounting without the established refund path.
7. Timeout or missing response enters unknown outcome. Reconcile by supported provider lookup; otherwise require operator/provider investigation. Do not generate a fresh create reference to escape uncertainty. Cancellation has its own pending/unknown outcome.
8. Provider delivery events update independent delivery status. Kitchen Ready remains kitchen progress. Managed orders must reject terminal manual Delivered; provider-confirmed delivery may invoke the existing idempotent feedback queue.

## Required shared-file integration gates

The coordinator must explicitly own/handoff checkout construction, settlement Paid-repair branch, original print preparation, confirmation consumer and terminal status/projection changes. Merely adding a new service does not satisfy integration acceptance.

Before dispatch integration: agreed versioned contract, persistence schema, authoritative provider binding, internal test provider and isolated datastore tests. Before live activation: Wolt sandbox proof, actual fees/areas/hours and full paid-booking/refund acceptance. Real courier and paper-output tests remain separately authorized physical acceptance.

## Failure cases to test

Concurrent paid webhooks; transaction callback retry/rollback; worker crashes before/after provider I/O; create success with lost response; cross-brand reference mismatch; quote expiration while paying; provider rejection after payment; refund timeout/replay; cancel/delivered race; duplicate and reordered events; Paid-repair branch before booking; repeated acceptance and print event; manual terminal completion of managed order; unchanged pickup/legacy delivery.
