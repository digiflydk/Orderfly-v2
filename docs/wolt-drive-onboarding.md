# Wolt Drive configuration and onboarding

Issues: #675, #676, #677. Coordination: #657 / #672.

## Server boundary

`resolveWoltBinding` requires an injected authorization function using the current server identity and a coordinator-owned binding repository. Authorization must confirm location ownership and permission before storage access. Returned bindings must match brand/location, active revision and deployment environment. No browser-selected merchant, venue or secret reference is authoritative. Resolve again for each operation; do not cache revoked bindings indefinitely. The integration caller owns the authenticated implementation of these functions, not this adapter.

`resolveWoltConfig` retrieves a key through an injected server secret resolver. It accepts only the documented fixed sandbox/production hosts and rejects environment mismatches before resolving secrets. Secret resolver exceptions are replaced with stable safe codes. The resolved object has a private key field and non-enumerable getter; serialization, spreading and ordinary inspection omit the key. Transport may explicitly read the getter solely to build the Authorization header and must never log headers. Do not copy the getter into public DTOs.

These are adapter seams, not new storage or secret provisioning. The production repository and secret store must enforce their own access policies. Sandbox and production credentials cannot be distinguished from their token text; the binding and secret resolver must enforce the environment separation.

## Onboarding evidence and remaining prerequisites

The PO supplied sandbox merchant/venue identifiers and a merchant key privately. Values are deliberately absent here. The sandbox pickup venue was configured by Wolt at Borgergade 10, 1300 Copenhagen. This is a sandbox fixture, not the restaurant's production pickup address.

At this checkpoint, receipt of credentials is verified, but their validity is not yet claimed. The coordinator owns real sandbox probes and stores only redacted results. Webhook client secret, publicly reachable HTTPS callback, subscription registration, account-specific scheduled delivery support and production merchant agreement/activation remain to be verified. No production configuration or new subscription has been created by this configuration task.

Use isolated tenant A/B mappings and synthetic keys for internal tests. Run `node --test tests/unit/wolt-config.test.cjs` and `npm run typecheck`. Tests cover scope denial before storage, mismatched/revoked binding, missing/invalid secrets, environment mismatch, redaction and asynchronous input mutation. Real sandbox lifecycle, production acceptance and hardware evidence are separate tasks.

## Official sources

- https://developer.wolt.com/docs/wolt-drive/endpoints documents sandbox `https://daas-public-api.development.dev.woltapi.com`, production `https://daas-public-api.wolt.com` and Bearer authentication.
- https://developer.wolt.com/docs/wolt-drive/webhooks documents merchant-specific webhook setup and `client_secret`.

Read on 2026-10-26. The API reference includes contradictory generic wording about basic authentication; endpoint instructions and examples specify `Authorization: Bearer <token>`.
