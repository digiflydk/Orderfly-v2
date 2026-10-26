# Optional Google routing adapter: review checkpoint, NOT selected or enabled

Date: 2026-10-25. Separate branch `feature/657-google-routing-optional`; excluded from frozen release PR #701. No Google APIs enabled, secrets created/read, billing changed, or real provider requests made. This is a tested implementation option awaiting retention/attribution resolution and explicit spend authorization, not a recommendation to activate.

## Implemented

`src/lib/delivery/routing/google/adapter.ts` implements the existing injected server adapter. Geocoding v3 resolves both endpoints; only a single ROOFTOP result with matching country/postcode/street/number and valid coordinate bounds is accepted. Partial, approximate, corrected or multiple results are rejected for clarification. This conservative policy can reject legitimate aliases; geocoding is not a guarantee of door-level deliverability.

Routes computeRoutes uses DRIVE / TRAFFIC_UNAWARE, no intermediates, no alternatives, no departure time and only `routes.distanceMeters,routes.duration`. Estimated transport duration excludes live traffic and is rounded up to integer seconds. Missing distance is never turned into 0 km. An empty returned routes list means no route; malformed responses, HTTP/API quota errors and timeouts mean unavailable. No retry, persistent cache, logging or registration is implemented. Secrets are explicit server-only dependencies; constructor performs no request. The Geocoding v3 key is necessarily in its request URL, so transport/proxy tracing must redact query parameters before activation.

Tests use injected fixture fetch only: valid requests/field mask, conservative address matching, invalid geometry, invalid distance/duration, unknown profile, quota/errors, bad JSON, no route and abort timeout. No live response validation is claimed.

## Costs, verified official sources

[Google global pricing](https://developers.google.com/maps/billing-and-pricing/pricing): Geocoding and Routes: Compute Routes Essentials each list 10,000 monthly free events, then USD 5 per 1,000 in the first paid tier (through 100,000). Each fresh quote currently requests two geocodes and one route. Derived marginal cost after allowances is USD 0.015 per quote. For 10,000 fresh quotes with no other shared billing-account usage, estimated API spend is USD 50: 20,000 geocodes minus 10,000 free, and 10,000 routes within its allowance. Repeat quotes and shared account usage consume quotas too. Taxes, currency conversion and hosting/egress are excluded. Confirm account pricing at approval time.

[Routes billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) classifies traffic-aware features above Essentials. This adapter deliberately does not request them. [Geocoding billing](https://developers.google.com/maps/documentation/geocoding/usage-and-billing) describes billing enablement and quotas. Pricing approval does not itself resolve retention or grant launch acceptance.

## Concrete setup proposal, not performed

1. Select an existing approved billing project after checking project ownership and separate hosting/data projects. Enable **Geocoding API** and **Routes API** only. No Maps JavaScript, Places, navigation or Address Validation API is required by this code.
2. Create a dedicated server key restricted to these two APIs, with server egress IP restrictions. Store in Secret Manager and grant only the runtime service account access; never use NEXT_PUBLIC or put keys in GitHub. Confirm stable outbound IP exists; if not, stop and review egress architecture/cost or supported OAuth alternative rather than leave an unrestricted key.
3. Proposed pilot ceiling: 100 quote attempts/day, 200 geocoding calls/day, 100 route calls/day; limit rate to 20 geocodes and 10 routes/minute. Configure actual available API quotas plus distributed application counters before registration. Counters must reserve budget before requests across all instances. Budget alerts are not hard spending caps. Inspect actual quota controls; do not claim unavailable daily dimensions exist.
4. No automatic retries. Explicit availability error on exhausted budgets. Monitor aggregate call/status/latency counters without addresses, URLs or keys. Abort locally after 4 seconds per request. Cancelled requests may still be billed by Google.
5. Add a separately approved integration call using a controlled test address only after the preceding gates. Current branch contains no credential wiring or quota counter implementation.

Security source: [Google Maps security guidance](https://developers.google.com/maps/api-security-best-practices).

## Specific launch blockers: retention and attribution

The current Orderfly quote design retains provider fulfillment coordinates, route meters/provenance and economic snapshots. Google's content rules do not establish a blanket right to keep that entire Google-derived payload permanently. Do not register this adapter in production or feed it into durable quote storage until the following are resolved:

- Determine the applicable billing-account agreement. [Current EEA service terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms), §6.2, distinguish 30-day geocode coordinate caching from a narrower indefinite allowance for direct end-user-facing functions, isolated to that user and not replacing extra API calls. §20.2 provides a 30-day coordinate caching allowance for Routes. Neither should be interpreted here as blanket permanent route-distance/duration storage authorization.
- Document a field-by-field retention classification: user-entered address, Google place ID, Google coordinates, route distance/duration, independent customer price and financial evidence. Decide expiry/purge behavior across quote records, attempt payloads, logs, backups and audit exports. Keep financial history intact while avoiding retention of restricted provider content. Do not simply delete signed snapshot fields and break their integrity. Seek provider confirmation if necessary, or choose a provider/license compatible with the required immutable snapshot.
- [Routes policies](https://developers.google.com/maps/documentation/routes/policies) and [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies) require appropriate attribution for displayed Google content. Add Google Maps attribution to relevant displayed distance/ETA/coordinate surfaces; keep courier ETA clearly identified as provider data. Review EEA map-use differences before any map view, and update public terms/privacy as required. This branch does not implement attribution UI.

These are concrete unresolved integration blockers, not an assertion that every possible use is prohibited. Leave production wiring absent until they have an approved solution.

Technical sources: [Geocoding requests/responses](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding), [computeRoutes reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes), [field masks](https://developers.google.com/maps/documentation/routes/choose_fields).
