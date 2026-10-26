# Levering release and activation

## Verified foundation release

PR #701 merged as `6f0032b1e918316870451132b48779483daedcee`. The production health endpoint reported that exact SHA on 2026-10-26 at 06:12:50 UTC. Authenticated read-only QA verified the Levering navigation, brand/location selection, inherited settings and empty delivery list. No settings were saved and customer delivery remained inactive. The foundation passed 87 delivery tests, typecheck, production build and independent review internally. No GitHub Actions was used.

## Native integration release

PR #707 assembles checkout quotes, settlement, provider dispatch, callback replay, tracking, cancellation and financial compensation. The previous release checkpoint records merge `b613c018ffd83677e496b5cf429b68c979ac7870`, reviewed head `8eb45f2d77f817b8fb788d538cb2f82b3c3b65e1`, tested tree `c4f40581a09f607df564e2aaa5f24ec7c265e865`, 445 passing internal tests, typecheck/build and independent review. Its authenticated read-only production verification is recorded in [#657 comment 6411523673](https://github.com/digiflydk/Orderfly-v2/issues/657#issuecomment-6411523673). These are historical release results, not newly executed tests or integrated sandbox acceptance.

On 2026-10-26 at 08:43:28 UTC, the resumed coordinator independently fetched `main` and read `/api/health`: both reported `b613c018ffd83677e496b5cf429b68c979ac7870`, and health returned `ok:true`. This narrower current check does not repeat authenticated browser acceptance or prove activation. #691 retains joint integration/browser acceptance; #694 retains configuration, pilot and release acceptance.

The same existing Firebase App Hosting deployment follows main. The data project remains `orderfly-39325`, separate from hosting project `orderfly-v21-10334086-b3076`. This release adds no production migration, index/rules deployment or secret/configuration mutation.

## Activation prerequisites

- Approve and configure a real route/geocoding source, costs, retention and attribution. Fixture distances are not deployable routing. Optional adapter code does not grant paid-service approval or establish licensing compliance.
- Provision scoped native provider bindings and a verified pickup contact, with distinct environment and pinned Secret Manager versions. Never use a customer-supplied provider/merchant/secret binding.
- Provision the scoped opaque callback route and a separate webhook signing secret, register it with Wolt and verify a genuine signed callback reaches durable storage. Merchant API credentials are not webhook signing credentials.
- Verify runtime service-account access, actual query indexes and heartbeat scheduling in an isolated environment. Index or production data changes require their own scoped authorization.
- Complete the integrated Stripe/Wolt sandbox checkout, including delayed payment, rejected and unknown dispatch, actual callbacks, cancellation and recovery. Controlled Wolt ASAP and scheduled quote/create/cancel evidence exists in #690, but is not complete Orderfly checkout acceptance.
- Approve real prices, hours, coverage, location adoption and customer terms. Scoped activation creates the independent `deliveryAdoptions/{sha256(JSON.stringify([brandId,locationId]))}` marker; choosing a provider in preparatory settings does not activate checkout. Physical courier/device/receipt acceptance is distinct from Chromium viewport and mocked print tests.

## Test and production configuration checklist

All configuration below is server-owned. This document does not provision records, approve a service or enable a flag. Inspect the current composition roots before provisioning; flags alone are insufficient.

| Requirement | Isolated integrated sandbox | Production pilot |
|---|---|---|
| Data and authentication | Explicit isolated datastore/Auth and synthetic tenant, location, users and catalog; no production credential fallback | Verified existing data project `orderfly-39325`, separate from App Hosting project |
| Environment | `ORDERFLY_DELIVERY_ENVIRONMENT=sandbox` | `ORDERFLY_DELIVERY_ENVIRONMENT=production` and `ORDERFLY_DELIVERY_PRODUCTION_ENABLED=true` |
| Customer quote flow | `ORDERFLY_DELIVERY_CHECKOUT_ENABLED=true`, `ORDERFLY_DELIVERY_ROUTING_ENABLED=true` and `ORDERFLY_DELIVERY_DISPATCH_ENABLED=true` in the isolated runtime | Same gates only after scoped pilot approval |
| Adoption | Synthetic location's strict managed marker in `deliveryAdoptions` | Approved location's managed marker; selecting Wolt in settings is insufficient |
| Runtime config | Matching scope/environment in `deliveryRuntimeConfigs`, routing and retention approval references, verified pickup name/E.164 phone/date | Independently verified production scope, pickup contact and approvals; test recipient details are not a pickup contact |
| Routing | Approved real source for external acceptance; synthetic fixtures prove only internal behavior | Approved source, billing/costs, attribution and actual retention design |
| Wolt authority | Active sandbox `deliveryProviderBindings`, canonical `deliveryWoltMerchants` and matching venue/location | Independently verified production records; one venue/location/callback per merchant/environment in v1 |
| Secrets | Pinned sandbox API secret and separate pinned sandbox webhook signing secret; verify runtime ADC access | Separate production versions and access; never plaintext records or `latest` aliases |
| Callbacks | `ORDERFLY_DELIVERY_CALLBACK_ENABLED=true`, matching active `deliveryProviderCallbacks` and registered reachable native callback; prove genuine signed inbox persistence | Same production checks with the production gate retained for existing work |
| Cancellation | `ORDERFLY_DELIVERY_CANCELLATION_ENABLED=true` for controlled sandbox cancellation | Enable only for the approved production operations; cancellation does not itself refund an order |
| Stripe | Actual test-mode authority for the configured account, test payment and signed settlement | Actual live-mode authority for the approved account; production payment/courier testing requires separate authorization |
| Workers and queries | Verify authenticated heartbeat, native queries, replay, acceptance, compensation and feedback | Verify runtime permissions, scheduler and actual required indexes before activation; production writes need scoped authorization |
| Print and feedback | Synthetic target/policy; existing `ORDERFLY_PRINT_INTENTS_ENABLED` gate if testing intents; safe controlled feedback configuration | Existing approved printer/feedback configuration; intent creation is not evidence of physical print or email receipt |
| Delivery settings | Effective scoped settings must have `enabled=true`, `paused=false` and `providerId='wolt'`, with synthetic approved test prices, hours, minimum and coverage | Same effective settings only for the approved pilot location, with explicitly approved prices, hours, coverage, minimum, customer terms and stop procedure |

The current runtime composition supports `google_maps` and explicitly approved sandbox-only `geoapify`. Geoapify requires its separate server gates/key, stable global quota namespace and scoped approval records; production Geoapify is rejected. See [Geoapify sandbox](geoapify-sandbox.md). Google additionally requires `ORDERFLY_DELIVERY_GOOGLE_RETENTION_APPROVED=true` and server-only `ORDERFLY_DELIVERY_GOOGLE_MAPS_API_KEY`. Approval references must represent a real decision about the actual immutable quote/provider storage, not placeholder strings used to bypass checks. See [Google routing option](google-routing-option.md) and [customer quote boundary](customer-quote-boundary.md).

The existing QA0 runtime is reusable for synthetic native/browser acceptance only. Its explicit demo project, credential rejection and loopback guard intentionally prohibit external Stripe/Wolt calls and production credentials. Do not loosen that runtime to claim external integrated acceptance. A separate safely isolated runtime is needed for actual external test services; this checklist does not assume that one exists.

The protected `POST /api/internal/delivery/dispatch` and existing `POST /api/internal/feedback/send` heartbeat use the existing timing-safe bearer policy with `ORDERFLY_FEEDBACK_WORKER_SECRET` or `ORDERFLY_NOTIFICATION_SECRET` (at least 32 characters). The latter runs other workers too, so do not invoke it as a read-only production diagnostic. No new scheduler or worker secret is implied. Verify the existing scheduler's actual invocation and successful bounded progress in the isolated runtime.

Query acceptance includes pending/submitting jobs, booked jobs with incomplete acceptance or inbox replay, rejected jobs with incomplete refund and no review flag, inbox reference pagination, scoped orders and due delivery feedback requests. Actual hosted query/index readiness must be checked; emulator success is not hosted index evidence. The release adds no production index deployment.

## Recovery and rollback

For a customer-entry stop, first disable `ORDERFLY_DELIVERY_CHECKOUT_ENABLED` to stop new quotes and final managed checkout revalidation. Retain the adopted marker and the configuration/bindings needed to process existing orders. Already-created Stripe sessions can still settle; inspect pending and paid jobs and decide their handling explicitly.

Do not treat `ORDERFLY_DELIVERY_DISPATCH_ENABLED` as a new-orders-only switch: it also gates the worker that retries native acceptance, replays early inbox events, recovers interrupted jobs and processes rejected-order refunds. Disabling it pauses that recovery too. If provider dispatch itself must stop immediately, disable it deliberately, record affected paid/pending/in-flight jobs and assign their reconciliation and compensation before resuming. There is no separate dispatch-versus-recovery gate in this version.

Keep `ORDERFLY_DELIVERY_CALLBACK_ENABLED` and necessary cancellation enabled for existing deliveries. For production work, retain `ORDERFLY_DELIVERY_PRODUCTION_ENABLED`: turning it off also rejects production callbacks and disables production cancellation. Active canonical bindings and callback records remain prerequisites. Disabling all flags or deleting bindings is not a safe routine pause.

Unknown create/cancel/refund outcomes must not be retried as new operations. Inspect their native immutable records and provider/payment evidence; a timeout does not prove absence. Courier cancellation does not itself refund or cancel a customer order. Before reopening checkout, verify backlog recovery, unresolved financial/provider outcomes and the intended location configuration.

A source rollback is an ordinary reviewed revert PR of the integration merge, followed by exact health-SHA verification and read-only live checks. Retain immutable quotes, attempts, payment/refund ledgers and event records; do not delete them as a rollback shortcut. Returning to code without managed-order support can strand in-flight work, so assess existing managed records before reverting.
