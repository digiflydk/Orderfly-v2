# Geoapify sandbox routing (#691 / #694)

> Superadmin platform configuration (#691) now supplies the shared Geoapify key, approvals and stable quota namespace. Its approved adapter can serve sandbox and explicitly activated production merchants. The sandbox-only environment-variable setup below remains a legacy fallback and standalone QA path. See [Merchant administration](merchant-portal.md).

## Authorized scope

On 26 October 2026 the PO approved Geoapify Free for the isolated sandbox, with at most 100 quote attempts per UTC day and no paid upgrade. The PO completed account authentication. The project `Orderfly Delivery Sandbox` was created and its Free plan verified. Its API credential is private and must never be included in this document, repository, browser screenshots, logs or issue comments.

This is approval of test routing, not customer delivery activation, a paid subscription, production data changes, or a paid courier. Native external Stripe/Wolt checkout acceptance still requires an isolated nonproduction runtime, datastore/Auth, test payment configuration, provider bindings, secret access and registered native callback ingress. Do not weaken the existing offline QA0 boundary.

## Adapter boundary

The server-only adapter uses the fixed EU Geoapify host. It resolves both Danish addresses and obtains one car route. It rejects approximate, ambiguous and mismatched house/street/postcode results. Initial coverage accepts OpenStreetMap building results only, so unfamiliar aliases or other source datasets can be rejected. This is a deliberate availability limit, not proof that an address is undeliverable.

No customer name, phone, email, order ID or delivery instructions are sent to the routing service. Addresses and coordinates are sent only for the requested test purpose. The provider's real response must validate before it becomes distance evidence. Each provider request has a bounded 10-second default timeout, including connection setup and body reading; the maximum remains 10 seconds. Timeouts, redirects, invalid units, malformed responses, quota rejection and provider errors fail closed. No automatic retry or fallback to a zero distance is permitted. Metric route responses accept only `meters` (observed in the real EU response) or `Meters` (the provider documentation spelling); missing, imperial and unknown units remain rejected. Route duration is a free-flow estimate, not live traffic or courier ETA; fractional distance/duration is rounded up to whole meters/seconds.

Each adapter instance belongs to one quote attempt, with at most two geocodes and one route. A durable reservation must succeed before any external request. Request inputs and dependencies are snapshotted so mutation while awaiting reservations cannot change authority or destination.

## Quotas and failure handling

The runtime quota is shared by the Geoapify project across locations and instances: 100 quote attempts per UTC day and five outbound requests in a rolling second. A transaction reserves budget before network access. Each retry samples a fresh clock and returns a one-second send deadline, checked again immediately before the network call. Rate reservations remain counted until one second after the latest permitted send, so delayed transactions cannot recycle grants early. This conservatively reduces throughput; expired grants are not renewed. The version-2 rate ledger rejects older/malformed records instead of silently resetting their budget. Failed and unknown calls retain their reservation; there is no automatic refund or retry. Storage errors or malformed counters deny access.

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

## Follow-up diagnosis, 26 October 2026

A credential-free request to the actual geocoding endpoint returned the expected HTTP 401: the earlier root-path HTTP 503 was not evidence of a general API block. Cold connection measurements were approximately 6.14 seconds in Node and 4.17 seconds for TLS establishment with curl, exceeding the former four-second default. The ten-second timeout retains cancellation, response-size limits, one-second send grants and all quotas; it adds no retries. Three routing requests can therefore consume up to 30 seconds of provider time, plus subsequent Wolt and datastore work. Actual hosted request deadlines remain a separate native acceptance requirement.

A controlled diagnostic run with the increased timeout returned HTTP 200 for both geocodes and the route, with both addresses verified. The route carried lower-case `distance_units: meters`, distance 2068 and duration 181.177 seconds. The old parser rejected that unit spelling. The correction explicitly accepts the observed and documented meter spellings while retaining finite numeric, nonnegative and single-route validation. No API credentials, raw addresses or route geometry are included in this evidence.

The corrected actual adapter passed the controlled run started at `2026-10-26T11:25:19.291Z`: geocode → geocode → route returned HTTP 200 / 200 / 200, both addresses verified, distance 2068 meters and rounded duration 182 seconds. The runner exited successfully and its lock was absent immediately after exit. The journal retains 15 request reservations, including previous failures. This closes the standalone routing scenario for the two approved test addresses only, not hosted/native Stripe/Wolt acceptance or customer activation.
