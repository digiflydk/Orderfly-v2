# Levering release and activation

## Verified foundation release

PR #701 merged as `6f0032b1e918316870451132b48779483daedcee`. The production health endpoint reported that exact SHA on 2026-10-26 at 06:12:50 UTC. Authenticated read-only QA verified the Levering navigation, brand/location selection, inherited settings and empty delivery list. No settings were saved and customer delivery remained inactive. The foundation passed 87 delivery tests, typecheck, production build and independent review internally. No GitHub Actions was used.

## Native integration release

PR #707 assembles checkout quotes, settlement, provider dispatch, callback replay, tracking, cancellation and financial compensation. A merge is not evidence of customer activation. Final head, checks, independent review and deployed SHA are recorded on the PR after the candidate is frozen.

The same existing Firebase App Hosting deployment follows main. The data project remains `orderfly-39325`, separate from hosting project `orderfly-v21-10334086-b3076`. This release adds no production migration, index/rules deployment or secret/configuration mutation.

## Activation prerequisites

- Approve and configure a real route/geocoding source, costs, retention and attribution. Fixture distances are not deployable routing. Optional adapter code does not grant paid-service approval or establish licensing compliance.
- Provision scoped native provider bindings and a verified pickup contact, with distinct environment and pinned Secret Manager versions. Never use a customer-supplied provider/merchant/secret binding.
- Provision the scoped opaque callback route and a separate webhook signing secret, register it with Wolt and verify a genuine signed callback reaches durable storage. Merchant API credentials are not webhook signing credentials.
- Verify runtime service-account access, actual query indexes and heartbeat scheduling in an isolated environment. Index or production data changes require their own scoped authorization.
- Complete the integrated Stripe/Wolt sandbox checkout, including delayed payment, rejected and unknown dispatch, actual callbacks, cancellation and recovery. Controlled Wolt ASAP and scheduled quote/create/cancel evidence exists in #690, but is not complete Orderfly checkout acceptance.
- Approve real prices, hours, coverage, location adoption and customer terms. Scoped activation creates the independent `deliveryAdoptions/{sha256(JSON.stringify([brandId,locationId]))}` marker; choosing a provider in preparatory settings does not activate checkout. Physical courier/device/receipt acceptance is distinct from Chromium viewport and mocked print tests.

Launch gates are server-owned and default off. Dispatch requires `ORDERFLY_DELIVERY_DISPATCH_ENABLED=true` and an explicit sandbox/production environment. Production additionally requires `ORDERFLY_DELIVERY_PRODUCTION_ENABLED=true`. Callback and cancellation have separate explicit flags so existing deliveries can be handled independently of accepting new orders. Customer checkout also requires complete approved runtime configuration. No flag is enabled by this code release.

## Recovery and rollback

First stop new customer quotes and dispatch if operational behavior is uncertain. Preserve callback ingestion and necessary cancellation/reconciliation for already submitted deliveries while reviewing evidence. Unknown create/cancel/refund outcomes must not be retried as new operations. Inspect their native immutable records and provider/payment evidence; a timeout does not prove absence. Courier cancellation does not itself refund or cancel a customer order.

A source rollback is an ordinary reviewed revert PR of the integration merge, followed by exact health-SHA verification and read-only live checks. Retain immutable quotes, attempts, payment/refund ledgers and event records; do not delete them as a rollback shortcut. Returning to code without managed-order support can strand in-flight work, so assess existing managed records before reverting.
