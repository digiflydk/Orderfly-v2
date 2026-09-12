# Funnel tracking repair (#123)

## Reproduction on 2026-09-11
The live all-brand dashboard showed 2 sessions, no menu/product/cart/checkout events, 29 purchases and 1450% conversion. These are observed report values, not an audit of actual sales.

A POST with an invalid event and Origin https://orderfly.dk returned 403; the same invalid body without Origin returned 400. Neither request could write an event. The collector compared the public Origin with the internal Firebase App Hosting request URL. This rejected browser telemetry before validation.

## Changes
- Explicit public-origin allowlist for both analytics endpoints: orderfly.dk and www.orderfly.dk, plus HTTPS SITE_URL when configured. Development accepts the request origin. Forwarded headers cannot grant authorization. Payload restrictions remain.
- AnalyticsProvider responds to consent changes. Still-visible menu/product/combo/checkout views can register after readiness/consent, once per view. Pre-consent actions are not buffered or replayed; revoked consent stops emission.
- Product tracking is independent of dialog initialization, preserving selected options. Combo views and quick-add cart actions now emit. Payment clicks and customer-info events carry location.
- Reports render incoming server data after navigation/refresh; source filters also reflect restored state.
- Session counts exclude payment-server and performance diagnostics. Paid orders remain the authoritative sales source. Measured conversion uses unique measured sessions with a matching paid-order session, regardless of counting mode; repeated purchases in one session cannot exceed 100%. Daily session counts no longer invent visits from paid orders.

## Verification
`npm run typecheck`
`node --test tests/unit/funnel-tracking.cjs tests/unit/invoice-attribution.cjs`
`node --test tests/unit/commerce-p2-browser.cjs tests/unit/checkout-browser.cjs`
The targeted funnel CI job installs Chromium and runs isolated synthetic fixtures. No production order, payment, contact or marketing event is created. Contract tests cover proxy origins, rejection of foreign origins/forged payments, collection persistence, idempotent event IDs, filters and measured conversion. Browser tests cover late consent with a product already open, no replay, revoke, quick add, combo views, and incoming dashboard data.

The Work cloud browser cannot open the local fixture URL (ERR_BLOCKED_BY_CLIENT); browser acceptance runs in GitHub CI.

## Release acceptance
Require green CI and independent review before merge/deploy. After deployment repeat the invalid same-origin probe (expected 400, never 403), confirm active build, then verify a controlled consented storefront session through the report. Denied consent must produce no browser funnel events. Real payment/marketing/email writes require the separately authorized controlled scenario. The issue stays open until live acceptance. Historical missing views cannot be reconstructed. GA4/Ads/Meta delivery is a separate acceptance check.

## Separate measured activity from paid sales (12 September 2026)

A reported 0 Click Purchase / 29 Purchase exposed misleading presentation. Browser
steps require statistics consent and are independent counts (or independent unique
session counts), while paid orders come from the server. Dividing adjacent counts
is not a sequential conversion rate: resumed carts, repeated actions and direct
add-to-cart can yield more later actions than earlier actions.

The dashboard now labels the chart "Målte handlinger", removes adjacent-step
percentages, and keeps authoritative paid orders outside that chart. Zero bars
have zero width. The paid KPI always uses paidOrders, including when browsing
unique-session counts. Inline explanations distinguish server sales from vendor
receipt and consented browser events. Paid orders with zero measured payment clicks
raise a specific diagnostic warning; no clicks or sessions are fabricated.

The real checkout already calls click_purchase in proceedToStripe after form
validation and optional upsell selection. Its existing browser regression checks
one collected payment click with brand, location and session after late consent.
A zero in a historical live report still requires examining that exact period,
brand, consent coverage and payment attempts. This UI correction does not establish
that those 29 orders had analytics consent or that Meta received 29 Purchase events.
