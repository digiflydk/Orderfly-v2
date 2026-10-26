# Managed delivery payment and acceptance

This integration is inactive while the coordinator's managed delivery/dispatch gate is closed. It adds no public refund endpoint, does not change ordinary pickup or legacy delivery payment behavior, and was tested only with isolated native stores and a synthetic Stripe transport. No real refund, customer message or physical print was performed.

## Account and payment authority

`resolveManagedStripeGateway()` resolves the existing active global Stripe credential, retrieves its actual account and returns the exact client plus `{accountId, livemode}`. Managed checkout must use that same client for session creation and persist the binding as `order.managedStripeAccount`. The credential is never persisted in the order. A later credential rotation is usable only if the retrieved account and mode still match. Switching to another merchant/account blocks processing instead of acting on an unbound payment.

`verifyManagedPaidOrder` retrieves session and PaymentIntent with expanded latest charge. It verifies account, complete payment-mode paid session, succeeded intent, exact order/brand/location metadata on both, DKK currency, amount, charge identity and mode. Its opaque process-local proof cannot be reconstructed from a browser JSON or forged response boolean. It expires after one minute. Zero-total/no-payment-required sessions are not supported by this positive-paid managed flow and must be rejected before creating a managed checkout; they need separate authoritative free-order acceptance logic.

## Settlement and accepted delivery

The native settlement writer keeps a managed paid order in Pending with `deliveryStatus: awaiting_booking`, while applying the existing invoice/customer/discount financial writes once. It atomically creates `deliveryDispatchJobs/{orderId}` pending. It suppresses ordinary confirmation, Omnisend paid-order message and original print until courier acceptance. Replayed payment events repair only the missing dispatch job; they do not recount totals. A managed binding change between preflight and transaction fails.

The authenticated dispatch worker invokes `completeManagedDeliveryAcceptance(scope)` after committing actual accepted provider outcome. The helper rereads native booked attempt, immutable managed digest, accepted result and matching network claim, plus freshly verified Stripe payment. It rejects refunded orders or a competing refund ledger. It performs the actual Pending-to-Received transition, records `orders/{id}/deliveryAcceptance/original`, sets `acceptanceCompletedAtMs`, creates the existing confirmation/consented marketing jobs and prepares original print intents in one transaction. Marketing preserves native brand/email/consent checks and original invoice time. No customer/financial counters are incremented during acceptance.

Original printing uses a separate opaque acceptance capability minted by that writer, with a fixed adapter in `printing/outbox.ts`. It does not pretend a Paid order is a fresh financial payment. Existing printer policy, catalogue projection, saved routing, manifest, queue budgets and job identity are retained. All reads occur before writes. A late printer failure rolls back acceptance and notification; retry does not dispatch another courier. If print policy is disabled at acceptance, enabling it later never silently backfills an original. Existing manual reprint remains the explicit operator path.

## Definitive rejection and compensation

`processManagedDeliveryRefund(scope)` is an internal function for the authenticated dispatch worker, behind the dispatch gate. It accepts no customer price or authority flags. It rereads native Paid order, rejected original attempt and actual rejected dispatch result. A provider result must bind the exact native network claim. A definitive local rejection must have `evidence: definitive_local_no_dispatch`, null claim ID and no native dispatch claim. Unknown booking outcomes are not refundable through this path.

A durable `orders/{id}/deliveryRefunds/original` submitting ledger commits before Stripe I/O. Its stable key binds scope, account, PaymentIntent and managed request digest. Only the first claimant creates a refund. Concurrent workers and every later call reconcile the original refund by exact metadata/amount/payment/charge instead; no blind replay occurs after timeout or idempotency retention expiry. Pending is not financial success. Invalid/lost responses remain unknown. Retrieval is bounded to ten pages of 100 refunds; incomplete results cannot prove absence.

Confirmed success atomically sets native `refundedAmountOre`, refund time and canceled status, creates an immutable negative `financialAdjustments/{key}` record referring to the original invoice, decrements the matching brand customer's totalSpend once and marks refund completion. The original invoice and historical order count remain unchanged. This adjustment is an accounting ledger entry, not a newly issued legal credit-note document. If the customer is deleted, foreign, malformed or has insufficient aggregate spend, the confirmed refund is still recorded but the adjustment explicitly marks `requiresCustomerReconciliation`; it never guesses a balance or modifies another brand's customer. Failed/pending/unknown states do not decrement totals. Existing loyalty/history/read models use native refund markers; no success is claimed merely because Stripe accepted a request.

## Internal validation

- `tests/unit/delivery-refund-worker.cjs`: real authority/worker modules with synthetic Stripe transport and native transactions; success/replay, timeout reconciliation, pending-to-confirmed, parallel calls, account/mode/metadata/amount/refund mismatches, disabled flow, missing evidence, local no-dispatch evidence and customer reconciliation.
- `tests/unit/delivery-acceptance-print.cjs`: actual existing routing/outbox modules, delayed acceptance twice yields one original per printer, no financial replay, forged capability denial and late print rollback.
- `tests/unit/payment-confirmation-job.cjs`: managed payment queues dispatch once and withholds confirmation/marketing while normal pickup/legacy confirmation remains unchanged.
- Existing settlement preparation and Stripe/pickup print integration regressions plus `npm run typecheck`.

Provider references checked: https://docs.stripe.com/api/refunds/create, https://docs.stripe.com/api/refunds/list, https://docs.stripe.com/api/accounts/retrieve. No live Stripe access was used to validate this implementation. Sandbox acceptance, dispatcher integration, credential readiness and production authorization remain separate release gates.
