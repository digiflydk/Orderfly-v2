# Stripe agreement binding

A new explicitly configured Stripe agreement is a complete brand or location
bundle. Its immutable Secret Manager version, mode and owner scope are saved on
the order. A location's own disabled or incomplete agreement never falls back to
the brand or the global account. Unknown stored providers/modes fail closed.
`readPinnedStripeAgreement` validates the original reference and environment;
configuration changes after checkout cannot move an existing order to another
key or account.

## Legacy compatibility archive

Merchants without explicit merchant configuration retain the existing global
Stripe onboarding. `resolveLegacyStripeAgreement(scope, modeOverride?)` snapshots
the selected global bundle into a create-once `platform_settings/stripe-legacy-*`
record. The digest includes tenant/location, environment and all credential
values. The order contains the reference, scope and mode only. Repeated identical
resolution reuses the record; a global key rotation creates another immutable
record and leaves old orders bound to the original key and signing secret.

The archive uses the existing private server-side platform-settings boundary,
where the legacy `payment_gateway` credentials already reside. It adds no Secret
Manager IAM dependency for legacy merchants. It is not a plaintext fallback for
new merchant agreements: an explicit Secret Manager reference that is missing or
unavailable fails rather than consulting legacy credentials. Keep these archive
records private, out of browser projections and logs, and retain them for the
lifetime of their original payments/refund/reconciliation requirements.

An omitted legacy publishable key or webhook signing secret remains omitted for
compatibility with hosted Checkout. A missing signing secret cannot authenticate
a webhook. New scoped agreements require the complete three-field Stripe bundle.
Historic orders created before binding was introduced still use their original
legacy compatibility lookup; account provenance cannot be inferred retroactively
from today's settings.

## Verification boundaries

`assertStripeOrderSession` matches the persisted session reference, order and
tenant/location metadata, exact DKK amount and the pinned test/live mode before
receipt reconciliation or confirmation. Stripe's zero-payment-required status is
accepted only for the existing verified zero-total discount-card contract.
Pinned webhook handling uses the original order's signing secret and validates
its event and session environment and scope. An untrusted body may select one
bounded candidate for signature verification; it is never payment authority.

Print verification independently retrieves from the pinned account and binds its
opaque proof to the stored agreement. A changed agreement invalidates the native
transition. A free order uses the separate `Free` receipt contract: dedicated
receipt-token hash, no PSP object, zero total and no Stripe request.

Local synthetic checks:

- `node tests/unit/stripe-merchant-pinning.cjs`
- `node tests/unit/payment-guest-receipt.cjs`
- `node tests/unit/printing-stripe-transition-proof.cjs`
- `node tests/unit/payment-confirmation-job.cjs`
- `node tests/unit/guest-receipt-delivery-estimate.cjs`
- `npm run typecheck`

These checks do not provision credentials, mutate production or prove provider
connectivity or deployed IAM. Checkout invokes the legacy resolver only when no explicit agreement exists, after authoritative pricing; verified Free orders bypass provider resolution entirely.
