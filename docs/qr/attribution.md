# QR conversion attribution: discovery contract (#400 / #389)

Discovery only, 21 October 2026. No tracking, cookie, integration or production
data is activated by this document. Documentation branch starts at integration
`a44e53a9e3aa5605ff5afbb9019e7dfbd3762d33`. The later local redirect candidate
`9c8f8b3e` was also inspected; it is not represented as deployed functionality.
Booking sources were read at Esmeralda repository main
`675e09a392cd2093ab9a6f8ce5e3d75a354d05e1`.

## What can actually be measured

| Measurement | Current source capability | Boundary |
|---|---|---|
| Accepted QR-link openings | Redirect event after successful atomic persistence | Does not prove camera use, receipt of the HTTP response or destination load |
| Probable scans, date/hour, device/OS/browser, referring origin | Classified request metadata; known bots/prefetch excluded | Heuristic, user-agent can be spoofed; referrer is often absent |
| Code/campaign/placement | Configured code metadata and event snapshot | Placement is the operator's label, not observed physical location |
| Unique QR scanners | **Unavailable** in current redirect writer | No visitorKey, cookie, raw IP or fingerprint is collected; do not display zero as a measured count |
| Unique consented destination sessions | Existing firstparty analytics session can support a future separate report | Sessions expire/rotate; excludes denied consent and unsupported destinations; never persons or all QR scanners |
| Paid Orderfly orders | Authoritative order settlement exists | QR provenance is not yet attached; click/session/receipt view is not payment proof |
| Confirmed table bookings | Native atomic confirmation and authoritative completion exist | Cross-system QR receipt binding/delivery not implemented |
| New club memberships | Transactional `member_joined` exists | Not yet QR-attributed; means membership creation, not verified email or later login |
| Country/city | **No trusted deployed source established by checked-in configuration** | Do not infer from arbitrary request headers or a restaurant placement label |
| Wolt/Uber/Dully purchases | **Unavailable without an independently verified return feed** | An outbound QR click is not an order or revenue event |

Current `metrics.ts` returns `estimatedUnique: null` when probable scans lack a
visitor key. It can deduplicate supplied keys, but that is not evidence that a
reviewed identity source exists. The redirect writer supplies none. Exact unique
people cannot be reconstructed from the retained data. Likewise historical
conversions cannot be recovered simply from matching daily totals.

## Existing firstparty source map

### Orderfly commerce

- `src/lib/analytics-attribution.ts`: allowlisted UTM `source`, `medium`,
  `campaign`, `campaignId` (`utm_id`), `term`, `content`, click IDs and sanitized
  landing/referrer fields. A new tagged touch replaces the earlier tagged touch;
  a direct visit keeps stored attribution. Arbitrary `qr_*` fields are absent.
- `src/context/analytics-context.tsx`: existing brand-scoped session and
  attribution cookies, refreshed to 30 minutes, **only with statistics consent**.
  Denial clears them. This discovery adds no cookie or identifier.
- `src/components/checkout/checkout-client.tsx` sends analytics session/device/
  attribution only when statistics is allowed. `src/lib/checkout-schema.ts`
  has a strict allowlist; arbitrary QR receipt fields currently fail validation.
- `src/app/checkout/actions.ts` stores the optional analytics snapshot on the
  order. It does not validate that browser-supplied UTM labels prove a QR visit.
- `src/lib/server/settle-checkout.ts` transactionally changes the saved order to
  `paymentStatus: 'Paid'`. Both Stripe proof and authorized received-at-pickup
  proof use this settlement path. Already-paid replay returns `fulfilled:false`.
  Its optional `payment_succeeded` telemetry currently runs only when there is a
  Stripe session; it is not complete pickup-payment conversion coverage.
- `src/lib/server/record-commerce-metric.ts` deduplicates trusted metrics using
  name/brand/order ID. Optional post-response telemetry is not a durable QR
  conversion outbox. `src/lib/commerce-metrics.ts` rejects client-forged
  `payment_succeeded` and has no QR receipt field.
- `src/lib/analytics.ts` emits browser purchase only after a ready brand tracker
  and current consent; browser sessionStorage deduplication is per destination.
  A confirmation page view or vendor call is not the authoritative sales source.

Statistics and marketing are independent purposes. Ads click IDs are removed
without marketing consent. Existing GA4/GTM/Meta configuration and vendor receipt
acceptance are separate from a native firstparty QR conversion record. See
`docs/orderfly-tracking-isolation.md` and `docs/funnel-tracking-repair.md`.

### Esmeralda booking, separate repository

Sources below are in `digiflydk/esmeralda-restaurant-operations`, not this repo:

- `webflow/bordbooking-widget-bootstrap.js`: five UTM fields, eligible ad IDs,
  consent snapshot, first touch/latest non-direct touch, origin/source-bound
  iframe messages. `esmeralda_booking_attribution_v2` is the existing
  consent-gated localStorage entry. No `qr_touch` field is currently retained.
- `supabase/functions/_shared/booking-attribution.ts`: closed bounded projection
  of those fields; an unknown QR receipt cannot survive merely by adding it to
  the URL or browser object.
- `supabase/functions/booking-api/index.ts`, confirm action: calls
  `booking_confirm_and_enqueue_atomic`; a successful result has `booking_id`.
  It binds attribution for non-replays, reads native tracking identity and calls
  `booking_record_authoritative_completion`. `confirm_clicked` is a funnel step,
  not a confirmed booking. Unknown HTTP outcome must retry the same idempotency key.
- `supabase/migrations/20260828185900_booking_attribution_reporting.sql`:
  `booking_attribution` is bound to native organization/location/booking, with
  consent, first/latest touch, canonical channel and synthetic-test exclusion.
  Channels currently have no `qr` value. Keep QR provenance separate rather than
  pretending a QR acquisition is direct, organic or a paid-ad event.

The booking API must verify an Orderfly receipt through a fixed authenticated
server boundary, then give the native binding operation only its verified
projection. No direct external network call from a database transaction is
proposed. Native organization/location and Orderfly brand/location mappings must
be explicit and checked. Manual, test-owned and idempotently replayed bookings
must not produce a second acquisition. Later rescheduling/cancellation is not a
new booking. Current provider outboxes are not a QR-specific return feed.

### Club membership

- `src/lib/loyalty/stamp-card/membership.ts`: strict signup schema has name/email,
  newsletter/terms acceptance and text versions, but no QR provenance/statistics
  field. New member, identity and deterministic
  `loyaltyEvents[hashKey('joined', memberId)]` are created in one transaction.
  Existing-member signup only stages a login link. The response is neutral.
- `verifyLoginLink` creates a customer session, not a new membership. Login,
  resubscribe and consent updates must not count as new-member conversions.
- `src/components/brand-tracking.tsx` deliberately returns early on club paths:
  **no thirdparty GA/GTM/Meta tracking on the personal club portal**.
  The surrounding brand layout still mounts the existing AnalyticsProvider;
  this is not a promise that all firstparty optional analytics infrastructure is
  absent. It currently supplies no server-bound QR signup attribution.
- Newsletter acceptance is not statistics consent. A future firstparty
  attribution adapter must use current optional statistics permission, preserve
  neutral signup responses and never expose whether an email already exists.

## Proposed common handoff, not implemented

Use a high-entropy, short-lived opaque `qr_touch` URL receipt, tied on the server
to an already recorded QR opening. No customer/contact field is placed in it and
no new browser identifier/cookie is introduced. Use the existing consented
attribution context on supported destinations, not a shared cross-domain cookie.
The opaque receipt is a bearer **attribution hint**, not proof of visitor identity;
it can be copied with a URL. It must never authorize access to an order/member.

Proposed server receipt projection: `schemaVersion`, `qrId`, `qrRevision`,
`brandId`, `locationId`, `scanEventId`, `occurredAt`, `expiresAt`. Default eligible
window: 30 minutes, matching the existing commerce analytics session; no
cross-device or post-expiry matching. Receipt lookup must validate the fixed
destination's native brand/location mapping and original event, not caller labels.
No new signing secret is provisioned here; the implementation can use a random
opaque lookup with server-only hash/key and bounded retention. Do not repurpose
loyalty login, membership QR, payment or unrelated integration secrets.

Append a receipt only to a verified supported firstparty destination, preserving
existing approved query/fragment semantics. Never attach it to external provider
URLs or follow arbitrary downstream redirects to transmit it. Unknown destination
mapping means no conversion handoff. Do not store receipt/query in logs or send
it to ad tags. The existing no-referrer redirect policy remains.

On arrival, validate the receipt and current statistics consent before retaining
it in the existing optional context. Denied/revoked consent means no retained
receipt and no conversion link. Capture a currently visible eligible landing
after late consent, but do not replay earlier nonconsented actions. A later
eligible tagged acquisition may replace it under a documented last-touch policy;
missing/expired/foreign context stays unknown. A server-confirmed business result
does not independently make the browser's analytics consent or UTM provenance true.

Proposed private conversion projection: `schemaVersion`, `conversionType`,
`sourceId`, `brandId`, `locationId`, `qrId`, `qrRevision`, `scanEventId`,
`convertedAt`, eligible consent snapshot, plus saved `grossPaidAmount`/`currency`
for paid orders only. Dedupe key is derived from native tenant/type/source ID,
never name, email, phone or a browser retry ID. Use a transactional write/outbox,
with server-only source IDs and aggregate-only QR reporting. Preserve historical
campaign/revision context; do not relabel an old conversion with current metadata.
No existing customer/order/member is backfilled in this discovery.

Paid value means gross confirmed payment, not profit or net revenue. Refund/net
revenue reporting needs a separate verified refund adapter and must remain
unavailable until then. Booking/signup have no invented monetary value. Label
channel coverage and partial pages explicitly; consented attributed conversions
divided by probable scans is a partial measured rate, not causal ROAS or an
all-person conversion percentage. A scan cohort and conversion window can differ.

## Geography and uniqueness capability check

`docs/deployment-flow.md`, `docs/brand-subdomains.md` and `apphosting.yaml`
establish Firebase App Hosting project/backend and forwarded host handling, but
do **not** establish a trusted country/city header injection/sanitization contract.
The redirect candidate expressly ignores forwarded geo/IP as authority.
Neither arbitrary `x-country`/`x-city` nor `X-Forwarded-For` is a verified source.
No geo database/API, raw-IP retention, GPS request or device fingerprint is added.
An operator must prove a configured trusted edge source before coarse geo can be
enabled; otherwise show unavailable. Country/city would still be approximate,
not a known scanner address or GPS position.

A future unique-session view can reuse only existing consented firstparty
sessions on participating destinations. It must report their coverage and own
time window, never populate the current redirect's unique-scanner metric by
guessing from device/OS/browser or by adding daily unique counts. Anonymous
redirect openings remain unidentifiable with the present data contract.

## Ready-sized implementation backlog

Each issue is at most one active 60-minute sprint. None is an active agent claim.

| Issue | Delivery | Depends on | Owner when assigned | Active sprint estimate |
|---|---|---|---|---|
| #422 | Common opaque receipt and consented firstparty handoff | Reviewed redirect/runtime and explicit destination mapping | QR runtime | 0.5–1 |
| #423 | Idempotent paid-order conversion, online and received pickup | #422, verified settlement | Commerce | 0.5–1 |
| #424 | Booking transport, consent and trusted native binding | #422, crossrepo mappings | Booking integration | 0.5–1 |
| #425 | Authoritative booking conversion outbox/dedupe | #424 | Booking backend | 0.5–1 |
| #426 | Firstparty new-member conversion, thirdparty portal remains off | #422, compatible statistics-consent decision | Loyalty | 0.5–1 |
| #427 | Scoped aggregate conversion dashboard and coverage | At least one released channel | QR analytics | 0.5–1 |
| #428 | Read-only proof of trusted geo and existing-session feasibility | Actual deployment/proxy evidence | Coordinator/operator | 0.25–0.5 |

Additional active implementation/discovery effort: **3.25–6.5 agent-hours**,
excluding this discovery and separate release/integration/QA effort. Crossrepo
review, explicit consent/mapping decisions, environment setup, controlled testbrand
access and device availability are waiting dependencies, not included work.
Allow a further **0.5–1 active sprint** for coordinated integration and acceptance
after adapters, plus CI/review/deploy waiting time of unknown duration. No calendar
deadline is justified before those prerequisites are verified. No new paid
service, secret or production write is authorized by these backlog descriptions.

## Discovery validation and handoff

Checked the actual source paths above, strict schemas, stored order analytics,
settlement transition/replay, member transaction and booking confirmation/binding.
Read the deployment contract and existing QR metrics/redirect privacy projection.
No new runtime or tests are added for a documentation-only change. Existing tests
were not rerun as evidence for unimplemented adapters. Each linked issue specifies
success, replay/rollback, foreign scope, denied/revoked consent and controlled
integration checks. No production session, payment, booking, member, ad event or
mail was created. Exact-head independent documentation review remains required.
