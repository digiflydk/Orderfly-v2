# Stripe and Worldline merchant payments

PR #914 extends the existing hosted checkout with **Worldline/Bambora Europe**.
Stripe remains supported. This document describes the code contract; local mocked
acceptance and an actual provider sandbox payment are separate evidence.

## Onboarding

Open **Superadmin → Brands → edit brand**, or **Locations → edit location**,
and use **Betalingsaftale**. The existing platform-superuser boundary applies.

1. On a brand, select its provider and disabled/test/live mode. On a location,
   select inheritance or its own complete agreement.
2. Enter that provider's test credentials. Worldline accepts the existing combined **API key** (optionally with `Basic `
   prefix) plus a separate **MD5 callback key**, or the three separate
   Merchant Number / Access Token / Secret Token fields plus MD5; Stripe needs secret key, publishable
   key and webhook signing secret. Worldline test merchant numbers start with T;
   live numbers start with P. Stripe key prefixes must match the selected mode.
3. Save. The saved summary shows the effective provider, agreement owner,
   environment and whether that environment has credential references. It is
   separate from unsaved edits; secrets are never read back to the browser.
4. Follow the controlled sandbox procedure below before enabling live operation.

Empty credential fields retain that scope/provider/environment's saved values.
A combined API key is decoded server-side using the official
`Base64(accessToken@merchantNumber:secretToken)` contract; it never contains or
replaces MD5. Use one input format at a time. For `merchant.bambora.com`, the
existing MD5 value is documented under **Settings → Merchant numbers → Edit →
MD5 key**. No additional API user/key needs to be created.
Changing a Worldline merchant number requires a new complete bundle. A location's
own agreement is indivisible: neither individual keys nor missing environments
fall back to the brand or global Stripe account. Explicit disabled, malformed or
incomplete configuration rejects payment. Explicit inheritance without a brand
agreement is incomplete. Existing merchants without a new agreement retain
legacy Stripe; new legacy checkouts also receive an immutable account reference.

[Administration and money controls](worldline-admin-operations.md) explains the
metadata-only order pane, permissions and unknown-result recovery.

## Storage and original account binding

New scoped bundles are JSON in Google Secret Manager, under
`orderfly-worldline-<scope hash>-<mode>` or `orderfly-stripe-<scope hash>-<mode>`.
`ORDERFLY_PAYMENT_SECRET_PROJECT` selects the secret project; otherwise the
Firebase Admin data project is used. The runtime requires create-secret,
add-version and access-version permissions on these bundles. Firestore
`platform_settings/worldline-<scope hash>` stores provider, mode, revision and
immutable numeric secret-version references. There is no plaintext fallback for
these agreements. Concurrent edits use revision checks; an orphan unused secret
version cannot change the active configuration.

Every new online order stores only its original provider, mode, account/owner
scope and immutable version reference. Settlement, receipts, print verification,
refund and delivery compensation use this original binding, not today's merchant
settings. Keep original secret versions and keys usable for the lifetime of the
payment's reconciliation/refund requirements. No migration guesses the account
of historic orders created before binding existed.

[Stripe agreement binding](stripe-agreement-pinning.md) documents the private
legacy compatibility archive. It uses the existing server-only platform-settings
storage so existing merchants do not acquire a new Secret Manager IAM dependency.
It is never a fallback for failed scoped-account resolution. Firestore client
access remains denied; credential archives never enter order/browser projections.

## Checkout, callback and settlement

Catalog, options, discounts, fees, fulfillment and amount are validated on the
server before provider routing. Existing checkout-attempt deduplication protects
refreshes/retries. Worldline session creation uses the Europe API, exact integer
minor units, HTTPS return/callback URLs and explicit `instantcaptureamount: 0`.
A lost create reply is an uncertain outcome, not permission to create another
session. No card details enter Orderfly.

Worldline receives callback URL `/api/payments/worldline/callback` in the session
request. It calls this URL with GET. The Europe hash is MD5 of decoded parameter
values in incoming order, followed by the merchant MD5 key. Duplicate parameters,
invalid references and parameters after `hash` are rejected. Callback admission
records one durable transaction link/job; it does not mark an order Paid.
Callback query/card data is not stored or logged by the handler.

The worker retrieves the transaction from the pinned merchant and checks order,
transaction, merchant, environment, amount, DKK currency/minor units and state.
Authorization is distinct from capture. Capture follows the existing automatic
Stripe business policy, through a durable single-flight money journal. Only a
fully captured, uncredited provider observation can mint a short-lived private
Worldline payment proof. It is bound to the original account, amount, payment
revision and absence of another money operation, and is checked again against the
financial transaction's current order snapshot.

The existing settlement plan still atomically owns capacity, promotion usage,
customer accounting, invoice, loyalty, game/upsell conversions and notification
outboxes. Worldline uses its own opaque print transition and private settlement
capability; it is never represented as a Stripe session. Financial and original
print-intent writes commit together, and replay cannot duplicate either.

A return/accept page is display/read capability only. Token-only Worldline receipts
poll the server, preserve Pending during an outage, and clear the cart/emit purchase
analytics only after authoritative Paid. Stripe session receipts remain supported.

## Money operations and cancellation

Capture, credit and delete use the Europe Transaction API. Each operation claims
an order-scoped durable journal/lock before provider I/O. Timeout or failed local
commit retains an unresolved operation; retry reads the provider and reuses that
request ID instead of resending a money mutation. Terminal journal states are
monotone. Refund accounting, immutable financial adjustment and journal completion
commit together; missing customer records are explicit reconciliation work.

Worldline's session DELETE expires the hosted window. Browser cancellation alone
never releases capacity. Expiry/cancel uses a shared payment-operation lock,
provider-confirmed expiry or authorization void, then native order cancellation
and idempotent reservation release. A late authorization after session expiry is
voided by the callback worker rather than captured. Unknown results keep the hold.

Verified zero-total discount-card orders use the separate native **Free** proof,
receipt and settlement path, with no payment provider or fake PSP identifiers.
The same invoice/capacity/loyalty/print transaction remains authoritative.

See [expiry and free checkout](worldline-cancel-free.md) for the exact contract and
[managed delivery payments](worldline-managed-delivery.md) for delivery acceptance,
original-account compensation and proof boundaries.

## Recovery and runtime

The existing authenticated `/api/internal/feedback/send` heartbeat runs payment
jobs, checkout-expiry and native Free settlement recovery independently from mail/delivery worker errors.
`worldlinePaymentJobs` and `worldlineCheckoutExpiryJobs` use a single-field due-time
query, bounded batches and backoff, so poison/terminal records cannot permanently
hide later payments. Original capture journals are reconciled even when a later
provider read already shows a successful capture.

An optional dedicated POST `/api/payments/worldline/worker` accepts
`x-payment-worker-secret` matching `ORDERFLY_PAYMENT_WORKER_SECRET` (minimum 32
characters). It does not replace the established heartbeat. Do not put secrets in
URLs, client configuration, source, screenshots or logs.

Worldline live additionally requires `ORDERFLY_WORLDLINE_LIVE_ENABLED=true`.
Leave it unset/false until the controlled sandbox procedure and release gates are
complete. This code change does not provision credentials, turn on live payment,
create API users or send an actual provider transaction.

## Controlled sandbox acceptance after manual key entry

1. Verify the deployed release, data project `orderfly-39325`, secret-project IAM,
   saved test agreement and the existing heartbeat. Hosting remains
   `orderfly-v21-10334086-b3076`; do not confuse hosting and data configuration.
2. The merchant enters the existing test credentials manually. Do not create an
   additional API key in the merchant portal. Configure Stripe's test webhook at
   `/api/stripe/webhook`; Worldline callback URLs are supplied per checkout session.
3. In an explicitly isolated/controlled test tenant, complete Worldline hosted
   checkout on mobile/desktop. Verify server transaction, captured amount/account,
   one Paid order/invoice, notification job and applicable original print intents.
   Do not treat a success page or queue acceptance as proof of payment/delivery.
4. Verify return-before-callback, callback-before-return/replay, refresh and aborted
   window, then confirmed authorization deletion and partial/full credit. Inspect
   provider and native journals after an induced transport interruption; never
   blindly resend an uncertain money operation.
5. Switch settings after creating a test order and prove its lookup/refund stays
   on the original test account. Repeat a Stripe checkout as a regression.
6. Exercise managed-delivery rejection/compensation in its sandbox without real
   courier dispatch or physical print unless those actions are separately chosen.
   Keep synthetic business data out of production; restore controlled fixtures.

Actual Worldline sandbox/IAM acceptance is still pending manual credentials.
Local tests use synthetic accounts, persistence and provider transport. Final
release evidence must identify the exact tested commit and distinguish local
unit/browser results, deployment and actual provider acceptance.

Official contracts:
- https://developer.bambora.com/europe
- https://developer.bambora.com/europe/checkout/getting-started/handle-responses
- https://developer-api.bambora.com/swagger/europe/checkout/api-reference/checkout
- https://developer-api.bambora.com/swagger/europe/checkout/api-reference/merchant
- https://developer-api.bambora.com/swagger/europe/checkout/api-reference/transaction


## Expected onboarding errors

Saving returns a serializable success/error result. Expected errors are never
thrown for the browser to display because Next.js masks thrown Server Action
messages in production. Missing MD5, invalid API-key format, environment mismatch,
missing authority, stale revision and unavailable/denied key storage have fixed,
redacted messages. Unknown write/response outcomes instruct a reload/readback
before retry. Fields are retained after a rejected save and cleared after success.
Unexpected transport/framework errors use a fixed fallback, never raw error text.
The callback hash requirement and server transaction verification remain unchanged.

## Checkout-start diagnostics

A successful credential save proves persistence and schema validation, not that
Worldline accepts the supplied API access. A failed checkout now includes a safe
support code. `WORLDLINE_CHECKOUT_HTTP_401`/`403` identify HTTP access rejection;
other bounded HTTP statuses and one-to-six-digit `meta.action.code` values are retained
as fixed diagnostic codes. For non-success HTTP replies the client best-effort
extracts only that numeric code, including five-digit Europe codes, and combines
it with the HTTP status (for example `WORLDLINE_CHECKOUT_HTTP_400_PROVIDER_40005`).
Unreadable or absent diagnostics preserve the original HTTP outcome and code.
Raw provider messages, response bodies, credentials,
customer contact details and hosted-session URLs are never included.
`CHECKOUT_CUSTOMER`, `CHECKOUT_ORDER` and the other fixed stage codes distinguish
failures before the provider call. Support must inspect the code rather than
assuming every payment-start failure is a credential error.
An unexpected customer-identity lookup failure also uses a fixed customer message;
it never exposes the underlying storage exception through validation errors.

`checkout_failed` logs are one JSON line containing only the fixed stage/code,
order reference when available and retryability. A definitive provider rejection
keeps the existing reservation release behavior. A timeout, invalid response or
uncertain session-link write still forbids a blind new payment attempt and retains
the original order reference for reconciliation. Diagnostics do not retry provider
requests, switch agreements or weaken transaction/hash verification.

Worldline requires merchant-registered domains for return/callback URLs. The
official checkout plugin's historical issue documents `40005` as
`invalidurlsupplied`: https://github.com/bambora/checkout-woocommerce/issues/12.
Only investigate that cause when the actual provider code supports it; HTTP 400
alone does not prove a domain mismatch. Register the intended domain on the
correct merchant agreement rather than changing account or weakening URL checks.

## Automatic return from hosted checkout

New sessions explicitly set `url.immediateredirecttoaccept=1`. The official Europe
Checkout contract defaults this option to `0` (automatic return disabled); `1`
redirects to the configured accept URL after completion without requiring a
"Back to shop" click. The accept URL keeps the original order ID and dedicated
receipt capability. A browser return never marks the order Paid: signed callback,
server transaction verification, capture and shared settlement remain authoritative.
Callback-before-return and return-before-callback continue to use the existing
Pending receipt/polling path.

This applies when creating a session. The current official API exposes no update
operation for an existing hosted session; an already completed window can use its
own "Back to shop" button to return with the original receipt proof. Do not start
another payment or fabricate a session-only receipt link for recovery.

The official sandbox instructions are at
https://developer.bambora.com/europe/checkout/getting-started/test-your-setup.
Use the payment window's **Use test card** option with a T-merchant; the guide
documents CVC `000` for successful authorization and a future expiry. Complete
the controlled acceptance procedure above before claiming provider verification.

Official API access guides distinguish portal generations:
- https://developer.bambora.com/europe/checkout/getting-started/access-api
- https://developer.bambora.com/europe/checkout/getting-started/access-api-previous
- https://developer.bambora.com/europe/checkout/getting-started/handle-responses
