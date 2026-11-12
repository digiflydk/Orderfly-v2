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
