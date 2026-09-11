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
