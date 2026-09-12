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


## Vendor delivery investigation

PR #129 is deployed as Firebase build-2026-09-12-003 (63e7fe4). Live consented menu/product/cart/checkout testing still produced no visible GA4 realtime or Meta Test Events receipt. GTM-PK4J8ZFD remains configured in the brand. Consent withdrawal removes the runtime; the reversible test cart was cleared.

The new CI vendor fixture loads real public vendor JavaScript but intercepts every collection request before it leaves the browser. It compares the current srcdoc document with an HTTP document to isolate runtime compatibility. Existing inert-script tests prove queuing, not vendor delivery. This investigation does not constitute live acceptance.

CI reproduction: srcdoc generated zero Google requests; the same vendor runtime in an HTTP document generated page_view and add_to_cart. Replace srcdoc with /tracking/frame, an inert same-origin HTML response initialized once through a validated parent/origin message. Configuration stays out of URL/query parameters. Ready/event queuing and frame removal on revocation/brand switch remain intact. Meta's fixture now uses the allowlisted virtual orderfly.dk origin while intercepting all collection, rather than localhost.

Review follow-up: set the frame's same-origin history URL from sanitized storefront context before vendor initialization and before subsequent events. Meta reads the document location rather than Google's explicit page_location. Real-vendor assertions check for receipt-token and internal-frame URL leakage as well as actual add-to-cart requests.

Meta iframe constraint: replacing document.referrer with an external campaign origin triggers Meta's traffic-permission rejection despite orderfly.dk being allowlisted. Preserve the real embedding origin via referrerPolicy=origin; do not override document.referrer. Send the original sanitized external hostname in the explicit referrer_host event field. Google retains the standard external page_referrer; Meta's native iframe referrer identifies Orderfly. UTM/fbclid stay in the sanitized storefront URL.

Vendor diagnosis: Meta 2.9.398's shared global_config is embedded in fbevents.js; no separate global_config download was needed. Both configurations complete, with no pending locks or async event queue. The actual pixel configuration includes HeadlessChrome in BotBlocking and the global client-side blocking guardrail has passRate=1. The CI test observes the real SDK send stage and asserts sanitized commerce payloads plus the bot flag and actual suppression message from the SDK send handler. Unexpected runtime/vendor errors fail the fixture. If the vendor permits the browser, actual outgoing AddToCart remains required. No browser identity or vendor protection is modified. CI bot suppression does not establish live customer delivery; ordinary-browser receipt is a separate acceptance gate.

Review coverage: commerce pagePath changes retain the sanitized landing query, including UTM and consent-eligible click IDs. The vendor fixture uses a production-shaped pagePath and explicitly requires the initial Google page_view as well as add_to_cart.


## Purchased product names

Verified paid purchases include the saved order product name as GA4 `items[].item_name`, alongside item ID, quantity and unit price. Names are trimmed and limited to 200 characters; legacy lines without a name still send their ID and numeric values. Only the product name is selected, never customer notes or contact details. GTM forwards the ecommerce items unchanged. Meta receives names in `content_name`, and keeps product IDs, quantities and prices in its standard `content_ids`/`contents` fields. Consent, brand isolation and per-destination purchase deduplication are unchanged.

Validation: `tracking-consent.cjs` tests purchase assembly and consent/deduplication; `brand-tracking-browser.cjs` checks named items reaching the GTM data layer and Meta payload in the isolated browser fixture. This does not prove vendor receipt in production. Existing historical purchases are not replayed.
