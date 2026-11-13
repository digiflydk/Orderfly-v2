# Worldline provider-side capture

New positive online Worldline orders persist
`psp.captureMode = provider_instant` before creating the hosted session. This is
an immutable order policy, separate from the merchant configuration and its
pinned secret version. Stripe, native free orders and pay-at-pickup orders do not
receive this Worldline marker.

For these sessions, Worldline owns the full-amount instant capture requested by
the checkout client. An early authorization callback is not a Paid order. The
server still retrieves and validates the transaction against the original order,
merchant, environment, amount and currency. If the transaction is authorized but
captured zero or only partially, reconciliation reports
`worldline_capture_pending`, leaves the durable job pending and performs no own
capture operation. The existing authenticated worker retries that observation
with its durable backoff. Only full capture without credits or another pending
money operation can enter the existing settlement/print transaction.

Existing authorization-only orders have no `captureMode` field. They retain the
original server-side `initial-capture` journal and its uncertain-result recovery,
including managed-delivery authority checks. Any other stored capture-mode value
fails closed; it never selects a fallback capture strategy.

The capture marker and server reconciliation alone do not prove the provider
session actually requested instant capture. They must be released together with
the matching checkout-client request and return/callback completion handling.
Local synthetic validation:

- `node tests/unit/worldline-instant-capture.cjs`
- `node tests/unit/worldline-checkout.cjs`
- `node tests/unit/worldline-managed-checkout.cjs`
- `npm run typecheck`

No real payment, production configuration change or sandbox acceptance is claimed
by these tests.
