# Commerce P2 implementation, issue #67

## Scope and release

This extends the P1 implementation in the same PR #68 and branch. It implements
all P2 development in #67 and the two P2 review findings on the earlier P1 head:
topping identifiers now accept the same maximum of 50 selections as topping
labels; Copenhagen clock changes cannot introduce nonexistent or duplicate slots.

No new login, payment integration, secret or data migration is required. #57 is
outside this work at PO's request. Existing application authorization is preserved;
this is not certification of raw database access. Review, PO acceptance, merge,
Firebase App Hosting deployment and live QA remain separate steps. Local results
do not prove deployed performance or replace the release checks below.

## Basket, catalog and navigation

- Fulfillment changes update the canonical `/{brandSlug}/{locationSlug}` URL,
  retaining other query parameters and fragments. Navigation and reload respect
  explicit URL mode. Changing mode still invalidates the previous checkout
  reference and revalidates saved choices; changed-cart receipt protection stays.
- The initial empty basket consumes server-provided scoped discounts without a
  second restoration request. Nonempty baskets retain choice persistence and
  authoritative restoration. Browser prices are never trusted during payment.
- Flattened products carry an effective display category separately from their
  native category ID. A virtual category no longer hides products or changes the
  category used to qualify promotions. Search handles names/descriptions and
  keyboard Escape, including mobile.
- Menu and restore use one combo eligibility predicate for native brand/location,
  fulfillment mode and Europe/Copenhagen schedules. The menu refreshes availability
  on focus and every 30 seconds. Different option/combination identities remain
  intact throughout P1's checkout and receipt flow.
- Fulfillment/time controls are available on desktop and mobile. Opening the time
  dialog uses the same local calculator and supplied location instead of making
  another Server Action read. The server still rechecks current location/time
  rules immediately before creating Stripe payment.
- Landing, header, product, campaign and footer order buttons open the fulfillment
  chooser and canonical menu. Mobile navigation works by pointer and keyboard. The fulfillment chooser uses
  one responsive dialog with explicit Escape handling, avoiding a desktop-to-mobile
  popup replacement during the first click.
  The active marketing landing uses native CPH Pizza/catalog/configuration IDs.
  Static demo products, memberships, unconditional free delivery and 25% pickup
  claims are removed. Product preview prices come from configured supported-mode
  base prices and are labelled “Fra”; the menu shows applicable item offers.
  Campaign tiles use active configured promotion names, amounts and conditions.

## Bounded optional reads and rendering

Read-only storefront data remains cached for 60 seconds, scoped by native brand
and location. Final checkout validation remains uncached and authoritative.
The landing starts with server-rendered useful content and a functional fallback;
optional configuration and promotion enrichment has a three-second budget.

Product/combo/time dialogs load on demand. Product options use a scoped public GET
projection, with shared in-flight reads, a bounded 60-second browser cache and a
five-second timeout covering body parsing. Failures are evicted and expose a retry
button. Default topping flags and sort order are retained. No dialog opens with
an unconfirmed options response. Stable product props preserve customer selections
when the menu clock updates. Allergen reads use the same bounded path and report
unavailability honestly. Product option endpoints verify native location ownership
and return only public selection fields.

Cookie configuration has immediate safe defaults and a cached public projection;
it no longer imports browser Firestore or lodash. Cookie/optional localStorage
access is guarded, explicit choices have an in-memory fallback, and blocked
storage never implies consent. Optional consent saving cannot crash the menu.
Theme configuration merges known fields without broad lodash. Category icons use
an explicit icon map instead of loading the entire registry. Product/card/cart
images specify their real display sizes.

## Money and clock contract

`money.ts` defines the DKK contract: round each unit and each option to integer
øre, then multiply quantity. An item percentage offer rounds the resulting unit
once; order-level discounts and percentage fees round once on the integer-øre
base. The basket, product/upsell/combo display, restoration, automatic promotions,
authoritative checkout validation, saved totals and Stripe line/coupon amounts
use this contract. Example: 1.005 kr. becomes 1.01 kr. per unit, so three units
cost 3.03 kr. The server price floor applies independently of discount eligibility.
An absent combo price makes that mode unavailable rather than creating a free item.
Existing saved choices are repriced on normal restoration; prices are not persisted
as authority. No blanket cache clearing or hold release is introduced.

Time slots must round-trip through Europe/Copenhagen without changing wall-clock
value, and their absolute instants are unique. Spring-forward preparation uses
real elapsed minutes: 01:50 plus 20 minutes cannot become 03:00. The autumn repeated
hour exposes one stable instant per displayed time. Save and payment reject stale
slots even if the dialog was left open.

## Performance and conversion measurement

`StorefrontVitals` uses the installed Next.js `useReportWebVitals` for LCP, INP
and CLS. Consented metrics include the initial document's generic page type,
mobile/desktop, metric ID and build release SHA. They exclude URLs/query strings,
contact data, attribution text and receipt/payment capabilities.

The existing collector accepts a small allowlist of commerce events. Menu, product,
cart and checkout interactions are optional and consent-gated; their failures
cannot escape into a commerce click handler. After session creation, the server
emits `payment_session_created`. `payment_succeeded` is emitted only by verified
transactional settlement, not by a browser confirmation view. Deterministic native
metric IDs count each paid order once, including repeated signed notifications.
Consented session IDs link the funnel; unlinked verified payments are counted
separately. Telemetry is not the financial source of truth.

Existing GTM dataLayer integrations receive only the same consented allowlist.
The existing `analytics_events` collection stores the narrow projection.
Server writes run after the response with a bounded optional budget. Existing
GA Measurement Protocol settings remain optional; when configured, sanitized
session-linked events are forwarded and verified purchases use the native order
as `transaction_id`. No GA credential is needed for native measurement.

`NEXT_PUBLIC_RELEASE_SHA` is public build metadata. The build chooses a valid
`COMMIT_SHA`, `GITHUB_SHA` or `NEXT_PUBLIC_RELEASE_SHA`, then a local Git HEAD,
otherwise `unknown`. Work Release must verify it matches the merged source SHA.
If the hosting build has no Git metadata or injected commit variable, set
`NEXT_PUBLIC_RELEASE_SHA` to that merged SHA before building. Never interpret an
`unknown` or different release tag as evidence for this release.

The read-only offline report consumes an authorized JSON export of native metrics:

```sh
node scripts/commerce-metrics-report.cjs /path/to/analytics-events.json MERGED_SHA
```

Input is an array or `{ "events": [...] }`. Output separates release, device,
page type and metric, with sample counts and p75 targets of LCP <= 2500 ms,
INP <= 200 ms and CLS <= 0.1. The funnel counts unique sessions at each stage and
unique verified paid orders. It prints no customer/session identifiers. These are
consented samples, not guaranteed complete attribution. No performance improvement
or conversion lift is claimed from implementation or small local fixtures.

## Focused local verification

No Actions, broad Playwright suite, production writes or real Stripe payments.
Tests execute actual production code with synthetic external I/O. The implementation
handoff recorded a browser-enabled pass of the original five P2 storefront cases,
three checkout/upsell cases and six cart completion cases. The final release runner
passed typecheck, the production build and 72 selected server/component cases.
It also compiled the updated six-case P2 storefront fixture, including the new
topping-cap regression, but could not execute Chromium because this runner has no
browser binary. Browser-enabled execution of all six cases remains a QA requirement.

```sh
npm run typecheck
node --test tests/unit/commerce-p2.cjs tests/unit/commerce-p1.cjs tests/unit/checkout-price-validation.cjs tests/unit/cart-restore.cjs tests/unit/checkout-availability.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test tests/unit/commerce-p2-browser.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='^success:|skipping an upsell|accepting upsell' tests/unit/checkout-browser.cjs
CART_CHROMIUM_PATH=/path/to/chromium node --test --test-name-pattern='only the matching paid checkout|changed fulfillment or bag' tests/unit/cart-browser.cjs
```

Coverage includes schema limits, DST, category fallback/search, query retention,
blocked storage, public projections, read deduplication/timeouts/retry, exact
basket/order/Stripe amounts for ordinary/item/code/automatic discounts, malicious
price rejection, safe metrics and paid-event deduplication. Browser cases cover
mobile/desktop CTAs, options defaults/retry/cache, search, canonical fulfillment,
reload persistence, keyboard/mobile navigation, storage failure, the 50-topping
cap across defaults/checkboxes/radios, successful checkout and upsell accept/skip.
P1 receipt/availability/combo rejections run again.
The P1 document's earlier test counts describe its earlier revision, not a rerun
of a broad suite for P2.

## Work Release and Work QA

Review and release P1 and P2 together from PR #68. Use `[skip ci]`; do not dispatch
Actions. After merge, deploy via the existing Firebase App Hosting process and
record the actual serving SHA plus the metric release label.

Before replacing the current deployment, Work QA can capture the current baseline.
On both mobile and desktop, use Chrome DevTools Performance/Network with fixed
viewport, device, CPU/network profile and no extensions:

1. Record the current running SHA, device profile and canonical route/mode.
2. Capture a cold browser-cache menu load with an empty basket. Interact with
   search, product options and fulfillment controls. Save the trace and transferred
   JS/image bytes. Cold browser cache does not prove a cold hosting process.
3. Repeat with a warm browser cache and a persisted synthetic basket. Keep the
   same route, data and profile. Separate document load from interaction timing.
4. Repeat the same captures after deploying the new exact SHA. Compare LCP, layout
   shifts, interaction latency, transferred bytes and duplicate catalog reads.
   Never save a HAR containing a real receipt capability or customer/payment data.
5. Run the P1 targeted live checklist plus landing/footer/mobile navigation,
   native promotions, category fallback/search, option retry, unsupported modes,
   clock/focus refresh and the same saved basket after reload.
6. Use only separately authorized test payments for complete funnel QA. Confirm
   ordinary/item/code/automatic totals match Stripe and receipt; duplicate a test
   notification without duplicating the verified-paid count. Failed optional
   metrics must have no effect on purchase.
7. With explicit statistics consent, confirm release/device-specific vitals and
   session-linked stages arrive. Without consent, browser metrics are absent.
   After sufficient representative traffic, export/report p75 with sample counts.

Keep issue #67 open for exact-release cold/warm evidence, independent review and
live QA. The field p75 targets are an acceptance measurement, not a result that can
be certified before deployment. No part of this handoff reopens #57 development.

References: [Next web vitals](https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals),
[lazy loading](https://nextjs.org/docs/app/guides/lazy-loading),
[native history](https://nextjs.org/docs/app/getting-started/linking-and-navigating).
