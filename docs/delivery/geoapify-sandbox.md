# Geoapify sandbox routing (#691 / #694)

## Authorized scope

On 26 October 2026 the PO approved Geoapify Free for the isolated sandbox, with at most 100 quote attempts per UTC day and no paid upgrade. The PO completed account authentication. The project `Orderfly Delivery Sandbox` was created and its Free plan verified. Its API credential is private and must never be included in this document, repository, browser screenshots, logs or issue comments.

This is approval of test routing, not customer delivery activation, a paid subscription, production data changes, or a paid courier. Native external Stripe/Wolt checkout acceptance still requires an isolated nonproduction runtime, datastore/Auth, test payment configuration, provider bindings, secret access and registered native callback ingress. Do not weaken the existing offline QA0 boundary.

## Adapter boundary

The server-only adapter uses the fixed EU Geoapify host. It resolves both Danish addresses and obtains one car route. It rejects approximate, ambiguous and mismatched house/street/postcode results. Initial coverage accepts OpenStreetMap building results only, so unfamiliar aliases or other source datasets can be rejected. This is a deliberate availability limit, not proof that an address is undeliverable.

No customer name, phone, email, order ID or delivery instructions are sent to the routing service. Addresses and coordinates are sent only for the requested test purpose. The provider's real response must validate before it becomes distance evidence. Timeouts, redirects, invalid units, malformed responses, quota rejection and provider errors fail closed. No automatic retry or fallback to a zero distance is permitted. Route duration is a free-flow estimate, not live traffic or courier ETA; fractional distance/duration is rounded up to whole meters/seconds.

Each adapter instance belongs to one quote attempt, with at most two geocodes and one route. A durable reservation must succeed before any external request. Request inputs and dependencies are snapshotted so mutation while awaiting reservations cannot change authority or destination.

## Quotas and failure handling

The runtime quota is shared by the Geoapify project across locations and instances: 100 quote attempts per UTC day and five outbound requests in a rolling second. A transaction reserves budget before network access. Failed and unknown calls retain their reservation; there is no automatic refund or retry. Storage errors or malformed counters deny access.

The quota namespace must be a stable deployment-controlled identifier for this one Geoapify project. Changing it, deleting counters, splitting the same workload across namespaces, or rotating a key must not be used to reset the quota. The cap is on quote attempts, not an exact assertion about provider credits. Verify actual charging in provider statistics before broadening usage. Other direct uses of the same key are outside this application's cap; keep the key exclusive to this sandbox.

The private standalone QA runner has its own durable local journal and a stricter cap of 100 reserved HTTP requests per UTC day (three reserved upfront for each attempt). Run it only while the runtime is unconfigured/inactive, with an exclusive QA key and no concurrent use of that key. Its independent journal cannot enforce a combined runtime/runner budget. That journal controls the single runner only; it is not evidence that distributed Firestore quotas or hosted indexes have been verified.

## Attribution and storage

`economics.route.source` is retained in the immutable, validated quote. The customer DTO projects that source, and the UI maps the exact `geoapify` value to fixed official Geoapify/OpenStreetMap labels and links. No provider-supplied HTML or URL is rendered. Unknown and legacy sources do not gain invented attribution.

Geoapify's [service description](https://www.geoapify.com/products-and-services/) permits result storage. Its [pricing](https://www.geoapify.com/pricing/) and [terms](https://www.geoapify.com/terms-and-conditions/) require attribution and usage limits. The initial OSM-only scope limits source obligations; preserve applicable source attribution when extending it. The EU endpoint does not itself establish all data-processing or contractual requirements. Before a production proposal, verify accepted account terms, data handling, source obligations, availability requirements and actual address coverage.

## Acceptance boundaries

Fixture adapter, quota and UI tests establish internal behavior only. A real Geoapify request proves routing connectivity for those addresses, not Wolt dispatch, Stripe settlement, native callback handling, physical printing or customer launch. Record exact source/test evidence and actual live outcomes separately on #691 and #694.

## Runtime configuration (sandbox only)

Use the existing checkout/routing/dispatch gates and a valid scoped adoption/runtime/provider configuration. Additionally set these server-only values in the isolated runtime:

- `ORDERFLY_DELIVERY_ENVIRONMENT=sandbox`
- `ORDERFLY_DELIVERY_GEOAPIFY_ENABLED=true`
- `ORDERFLY_DELIVERY_GEOAPIFY_RETENTION_APPROVED=true`
- `ORDERFLY_DELIVERY_GEOAPIFY_API_KEY` from secure runtime secret storage
- `ORDERFLY_DELIVERY_GEOAPIFY_QUOTA_NAMESPACE` as one stable non-secret identifier for this Geoapify project

Set the scoped runtime source to `geoapify` and retain real routing/retention approval references. Production selection remains rejected even if generic production flags are enabled. Availability checks and adapter construction make no provider call and reserve no budget. Native requests reserve the shared Firestore `deliveryRoutingBudgets` documents first. This release does not set any of those flags or write production records.

## External routing attempt, 26 October 2026

The first controlled attempt at 09:56 UTC reserved three requests in the private journal. Both geocode requests ended without an HTTP response; no route request was sent. The run failed closed and retained its reservations. This is not successful Geoapify connectivity or address-coverage evidence. No automatic retry, Wolt booking, Stripe payment or production write occurred. External routing acceptance remains open pending an execution environment with verified connectivity.
