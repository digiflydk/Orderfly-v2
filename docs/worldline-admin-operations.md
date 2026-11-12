# Payment administration in PR #914

The payment agreement section on brand/location edit pages shows the **saved
agreement used by checkout** separately from unsaved form edits: provider,
brand/location/platform ownership, environment, and whether that environment has
registered credentials. Loading this summary never reads Secret Manager and does
not return secret versions or key values. The legacy Stripe summary projects only
mode and key-presence flags from the existing server-only gateway record.

A location's own disabled or incomplete agreement never appears ready because its
brand has keys. Explicit brand inheritance without a stored brand agreement is
shown as incomplete and cannot be saved until that brand agreement exists. Existing
merchants without new configuration retain their legacy Stripe summary. Saving a
new disabled agreement intentionally disables online payment; the UI says so.

Keys remain write-only. Empty fields retain previously saved values in the same
scope/environment. Switching provider clears unsaved hidden key fields from the
browser. Changing a Worldline Merchant Number requires all four new fields, so a
new account cannot silently reuse the old account's token/key bundle. Input errors
use fixed messages rather than echoing credential-bearing validation payloads.
Stored schema, ownership, authority and revision checks apply before publication.

## Worldline order payment panel

The existing order detail payment card adds a Worldline panel with the order's
original merchant, environment, agreement owner, order amount, refunded total and
remaining balance. The browser receives no credentials, secret references or
hosted checkout token. Viewing it requires current `orderfly.orders:view` for the
order's tenant/location; every money operation independently requires
`orderfly.orders:edit`.

Capture remains automatic through the payment worker, matching the existing Stripe
capture policy. An authorization is never labelled captured by this panel. Manual
refunds are available only for Paid Worldline orders. An unused known Worldline
authorization can be voided while payment is Pending. Managed-delivery payment
changes stay owned by the delivery recovery flow rather than this manual panel.

Refunds accept positive DKK amounts with at most two decimal places. Confirmation
shows the exact amount before the action runs. The server derives the transaction,
actor and tenant; browser-supplied authority/provider fields are rejected. The
provider's observed balance and the money-operation journal remain authoritative.
A confirmed void calls `finalizeWorldlineVoid` before reporting success, so order
cancellation and reservation release use the shared verified cancellation path.

Each manual operation gets one UUID before dispatch. The UI retains that identity
and immutable amount after a timeout or unknown response, and offers **Kontrollér
resultat** rather than a new operation. Session storage holds only that request ID,
operation type and minor-unit amount, never provider/guest credentials. An active
journal belonging to the same authenticated actor can restore its identity after
refresh. A different actor's pending journal exposes only a locked-state message.
The core journal determines whether the repeated request is a readback/replay; the
browser cannot authorize a duplicate financial mutation.

## Local validation

- `npm run typecheck`
- `node tests/unit/worldline-admin-actions.cjs` — seven scoped authorization,
  redaction, request-boundary, pending recovery and confirmed-void tests.
- `node tests/unit/worldline-admin-settings.cjs` — seven effective agreement,
  missing-brand, credential-presence, key rotation and redacted-input tests.
- `node tests/unit/worldline-settings.cjs` — eight existing settings regressions.
- `npx playwright test -c tests/payments-admin/playwright.config.ts` — three real
  component flows at desktop/mobile (six tests), with intercepted server actions.
- `npx playwright test -c tests/payments/playwright.config.ts` — desktop/mobile settings and token-only confirmation browser tests.

These are synthetic local checks, not Secret Manager IAM verification or a real
Worldline capture/refund. No merchant keys, live operations, Actions workflow,
merge or deployment are created by this administration change. The whole candidate
still needs the coordinator's current-head integration/review and the separately
controlled Worldline sandbox acceptance after manual key entry.
