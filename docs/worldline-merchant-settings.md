# Worldline merchant onboarding settings

Brand and location edit pages expose separate Worldline configuration. Platform
superusers only may read or write it; the server checks that the brand exists and
that a supplied location belongs to it. Unconfigured locations inherit the brand.
A location can instead select its own complete agreement. No credentials or
individual fields fall back between agreements or between test and live.

Each agreement has disabled/test/live selection and separate merchant number,
access token, secret token and callback MD5 key for each environment. T-prefixed
merchant numbers are required for test and P-prefixed numbers for live, following
Worldline Europe documentation. This is structural validation, not a successful
provider connection test. Blank fields preserve saved values. Initial provisioning
requires all four values. Switching an inherited location back to own retains its
previous credentials; the administrator explicitly selects its environment.

Credentials are JSON bundles in Google Secret Manager, scoped by hashed brand and
location plus environment, with pinned versions. `ORDERFLY_PAYMENT_SECRET_PROJECT`
selects a deployment-owned project, otherwise the Firebase Admin project is used.
The runtime needs create/add/access secret version permissions on the corresponding
`orderfly-worldline-*` secrets. There is no plaintext fallback. Firestore
`platform_settings/worldline-<scope hash>` stores references and revision only.
No secrets or references are returned to the browser or written to form recovery.
Revision checks prevent concurrent administrators overwriting newer settings.
A concurrent failed update can leave an unused secret version; it does not change
the active reference. Existing Firestore client deny-all rules apply.

## Rollout status

This is configuration groundwork, not a Stripe replacement. Checkout still uses
its existing integration. The UI states this explicitly. The internal resolver is
available for the forthcoming Worldline payment adapter, and is not a server
action. Do not represent saved live settings as a working live checkout.

Remaining integration: provider credential verification, payment session creation,
callback hash plus server transaction verification, durable duplicate protection,
capture/cancel/refund, existing order side effects, and controlled sandbox/mobile
acceptance before routing any checkout to Worldline. Existing Stripe transactions
must retain their original provider for refunds and reconciliation.

Validation: `node --test tests/unit/worldline-settings.cjs`; `npm run typecheck`.
Authenticated browser and Secret Manager acceptance require an authorized test
runtime and are still pending; this change must remain a draft until verified.

References: https://developer.bambora.com/europe/checkout/getting-started/access-api
and https://developer.bambora.com/europe/checkout/getting-started/test-your-setup.

Provider preference is now stored on the agreement (`stripe` default or
`worldline`) and inherited with the whole agreement. This preference remains
staged: it is not yet used to route payment requests. Stripe still uses existing
platform settings. Do not enable the preference in checkout until settlement,
printing, managed delivery refund and callback verification support both providers.

## Hosted checkout adapter

`worldline-client.ts` creates hosted sessions with server-side Basic authentication,
integer minor amounts and HTTPS return/callback addresses. It validates the hosted
redirect origin and session token. Network failures, malformed responses and server
errors are uncertain outcomes and must not trigger a new-session retry. Provider
error payloads and credentials are never included in thrown errors. Transaction
reads validate the requested transaction identity and merchant account.

The adapter remains internal and is not yet connected to order settlement. It must
not be enabled in checkout until callbacks, pinned agreement references, printing,
refunds and managed delivery have been integrated and tested. Manual key entry is
supported by the settings UI; actual connection acceptance can happen after keys
are supplied. Run `node --test tests/unit/worldline-client.cjs` for adapter checks.

## PR #914 integration checkpoint (2026-11-12, unreleased)

The candidate now includes write-only Stripe test/live bundles alongside Worldline
bundles, whole-agreement selection, pinned merchant secret versions, hosted
Worldline session routing, signed callback admission, durable payment jobs and a
Worldline-specific captured-payment settlement/print capability. It does not
manufacture Stripe sessions. Order invoices retain the Worldline provider label.

Callbacks use GET `/api/payments/worldline/callback`. Europe `Handle Responses`
requires decoded values in incoming order, excluding `hash`, followed by the MD5
key. Duplicates and parameters after hash are rejected. A valid callback only
admits a durable job; server-to-server merchant/transaction/order/amount/currency
and captured-state validation precedes Paid and print. Callback query/card fields
are not persisted. Worker execution also runs on the existing authenticated
`/api/internal/feedback/send` heartbeat, isolated from other worker failures.
`/api/payments/worldline/worker` is an optional dedicated endpoint protected by
`ORDERFLY_PAYMENT_WORKER_SECRET`, at least 32 characters.

Worldline capture follows the existing automatic Stripe capture model. Capture,
credit and delete use Europe Transaction API POST endpoints. Every operation has
an order-scoped durable journal and exclusive lock. A lost response is read back;
it never automatically submits a second money operation. Confirmation is reported
only after the journal transaction commits. Unknown operations retain their lock
for reconciliation. Payment proofs bind the account, amount, payment revision and
absence of a pending money operation. Administrative credit/delete additionally
require authenticated `orderfly.orders:edit` for the order's tenant/location.

Stripe explicit agreements use their pinned secret for checkout, confirmation,
receipt, cancellation, print verification, stale holds and managed-delivery
verification/refunds. The existing `/api/stripe/webhook` additionally verifies
candidate events against the original order's pinned signing secret. Merchants
with no explicit merchant configuration retain the legacy global Stripe flow.
An explicit disabled/incomplete agreement fails rather than falling back.

### Manual key entry and acceptance

Use Superadmin -> Brands -> edit brand, or Locations -> edit location, then the
payment agreement section. Select own/inherit, provider and test/live/disabled.
Worldline requires merchant number, access token, secret token and MD5 key for the
selected environment. Stripe requires secret key, publishable key and webhook
signing secret. Empty fields retain that environment's previously saved bundle.
Configure Stripe's webhook at `/api/stripe/webhook`. Worldline callback/return URLs
are generated in the session request. Secret Manager needs permissions on both
`orderfly-worldline-*` and `orderfly-stripe-*` bundles. Runtime/IAM access remains
to be verified; no keys are created or retrieved from the merchant portal.

Worldline live additionally requires `ORDERFLY_WORLDLINE_LIVE_ENABLED=true`; do not
set it before sandbox acceptance and remaining integration gates. At this
checkpoint, managed delivery with Worldline is rejected before order/session
creation. Zero-total Worldline checkout has no dedicated free-order path yet.
Those are remaining implementation tasks, not successful integration claims.
A canceled browser window without a known authorization cannot release a still
payable session's reservation. Session-expiry/recovery acceptance remains open.
The administrative money actions exist but final order-management UI remains open.

Local synthetic evidence so far includes existing settlement preparation (11),
checkout regression recovery (4), Worldline settings (8), client (9), callback (3),
transaction validation (4), operation journal (7), checkout routing (3) and
Worldline settlement/print (3) tests. Later changes require revalidation; these
counts are checkpoints rather than final release evidence. Browser tests use
intercepted server actions and synthetic keys, never production login or data.

Still required: full managed-delivery Worldline adapter and compensation tests;
free-order/expiry/cancel completeness; final administration integration; full
current-head regression/browser suite; independent review; PR description update;
manual Worldline sandbox payment/capture/cancel/refund acceptance after key entry.
No merge, deployment, live activation or real provider payment is claimed.

Official contracts checked during implementation:
- https://developer.bambora.com/europe/checkout/getting-started/handle-responses
- https://developer-api.bambora.com/swagger/europe/checkout/api-reference/merchant
- https://developer-api.bambora.com/swagger/europe/checkout/api-reference/transaction
