# Orderfly tracking isolation (#125)

## Purpose and destinations

Esmeralda's native Orderfly storefront must use its own GA4 property/web stream,
GTM web container and Meta dataset. Dully and esmeraldapizza.dk keep their existing
identifiers. Existing advertising accounts and campaigns are preserved.

The brand's GTM container owns **GA4 only**. Configure the Google tag with the
new stream ID and `page_location` from the data layer. Configure GA4 event tags
for `view_item_list`, `view_item`, `add_to_cart`, `begin_checkout`, `click_purchase`,
`purchase`, using ecommerce data and `brand_id` / `location_id`. Disable automatic
form collection and enhanced history pageviews; no customer fields, receipt
query strings or free-text searches belong in this property. Do not install
Google Ads or Meta tags in this container: those destinations have a single
explicit owner in the brand runtime, independently gated by marketing consent.
Use a new named Google Ads Purchase conversion action for Orderfly in the existing
account; do not additionally import the same GA4 purchase as a primary conversion.

All events carry explicit destinations. Removing a brand's iframe tears down its
runtime on brand navigation or a consent change. The parent document no longer
pushes a second copy into a global dataLayer, and the server collector no longer
forwards to global GA_MEASUREMENT_ID / GA_API_SECRET. Those environment variables
no longer affect commerce collection. No CAPI/Measurement Protocol fallback is
introduced without a separately designed consent and delivery contract.

## Consent and sessions

- No optional runtime when both statistics and marketing are denied.
- Statistics only: internal consented funnel and brand GA4/GTM; ad consent denied.
- Marketing only: explicit Google Ads/Meta destinations; no internal analytics
  session or funnel collection. Newsletter subscription is a separate consent.
- Both: each purpose gets its own allowed events. Consent Mode v2 defaults precede
  Google tag loading. This is basic blocking, not advanced denied-consent pings.
- Revocation removes the runtime and owned optional tracking cookies. Consent
  records and essential basket/checkout storage are not repurposed for analysis.
- Analytics IDs are now brand scoped, set only with statistics consent, and
  renewed on events/navigation with a 30-minute inactivity expiry. Legacy
  year-long shared IDs are retired. This changes measured-session comparisons
  with historical data. GA4 has its own session definitions; counts need not match.
- Campaign attribution is optional, allowlisted, session-lived and excludes click
  identifiers when marketing is denied. No fingerprinting or anonymous individual
  journey reconstruction is implemented. Anonymous activity counters require a
  separate collection-method assessment and remain off.
- The banner exposes an explicit rejection action; reopening preferences shows
  the saved choice. Current visible views can be measured after consent. Earlier
  nonconsented cart actions are never replayed.

## Ecommerce and coverage

Internal view_menu/view_product/start_checkout map to Google view_item_list /
view_item / begin_checkout. Meta receives PageView, ViewContent, AddToCart,
InitiateCheckout and Purchase when marketing is allowed. Product IDs and numeric
quantities/prices are allowlisted; no names, email, phone or checkout fields are
sent. Product-dialog add_to_cart is the added line's value, not the whole cart.

Purchase remains gated by the receipt's server-verified Paid order. Order ID is
Google transaction_id and Meta eventID. Browser deduplication is per purpose and
per receipt in sessionStorage, so enabling a second purpose does not resend the
purchase to the first. The receipt waits for a ready destination and retries when
consent is granted there. This prevents common reload duplicates; it is not a
claim of guaranteed network receipt or exactly-once delivery across devices/tabs.

Funnel totals retain all verified orders. New `paidOrders` counts actual orders
regardless of the display counting mode; `measuredPaidOrders` counts orders whose
session appears in the selected measured events. Coverage = measuredPaidOrders /
paidOrders, for the current date/brand/location/source/device selection. Multiple
orders in one measured session count correctly. AOV uses actual order count.
These figures do not assert that an advertising platform received an event.

## Validation and release

`npm run typecheck`; `node --test tests/unit/tracking-consent.cjs
 tests/unit/funnel-tracking.cjs tests/unit/invoice-attribution.cjs`.
Funnel regression CI runs the real React storefront/checkout suites and the
isolated brand runtime browser suite with synthetic fixtures and blocked external
tag downloads. Covers independent consent combinations, no global server GA,
wrong brands, per-purpose receipt deduplication, late consent, revocation, branded
session lifetime/reload/rotation and order-level coverage.

Required external acceptance after configuration: inspect a consented menu,
product, quick-add and checkout in GA4 DebugView and Meta Test Events. Inspect
network destinations, page URL/click attribution (including the iframe runtime),
standard event names, IDs, amounts and consent settings. Verify no optional tag
requests on a fresh rejected visit. Controlled Paid-order acceptance needs a
scoped synthetic Stripe test; do not place an unsolicited live charged order.
Review and CI precede merge. Deployment and platform receipt verification are
separate gates. Issue #125 stays open until these have completed.

## External setup checkpoint (2026-09-12)

- User explicitly approved GTM/processor and Meta Business Tools terms. Both
  account/dataset creation steps completed.
- GA account Orderfly 361886243; separate property 553852737; stream
  15763775538; measurement ID G-551JD0H72K. Denmark/DKK, enhanced measurement
  disabled. Event dimensions brand_id and location_id created.
- GTM account 6376469965, container 263933032 / GTM-PK4J8ZFD. Published version 2
  has one Google tag, one GA4 ecommerce event tag, one allowlisted event trigger
  and four data layer variables for brand/location and sanitized page/referrer.
- New Meta dataset Esmeralda – Orderfly: 1830622624963740, owned by Esmeralda
  Amager 1120201685035593. Allow list orderfly.dk (including subdomains).
  Automatic extra page/product collection disabled; automatic advanced matching
  and automatic event setup off. No ad account assigned yet. Existing Dully
  1520307403428848 and website 773544982454626 datasets were not repurposed.
- Google Ads session exposes only closed account 871-063-4119 under
  okh2071@gmail.com. Active Esmeralda account access is still needed.
- PR #127 merged as 0812e627a16fb1cc79a9614bc53725bb540f4e12 and deployed as
  build-2026-09-12-001. GA4/GTM/Meta IDs were saved in the Esmeralda brand.
- Controlled live visit found a Meta bootstrap incompatibility: the loader
  reported conflicting pixel versions before receipt was confirmed. Restore
  the standard _fbq and push aliases so the vendor loader recognizes the queued
  bootstrap. Existing tests used inert downloaded scripts and could not establish
  real vendor compatibility. External receipt verification remains a separate gate.
- Controlled test campaign: orderfly_qa_125 / qa / tracking_release. No paid order
  was submitted. Ads, external event receipt and paid-order acceptance remain open
  in #125. Do not equate runtime-ready or mock test passes with vendor receipt.
