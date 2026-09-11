# Esmeralda invoice, storefront and campaign attribution

## Scope

This release coordinates two repositories:

- Orderfly creates an immutable invoice snapshot only after Stripe has verified payment, exposes the safe snapshot on the receipt page, captures consented campaign attribution and reports the real checkout funnel.
- Opsfly renders and sends the matching invoice email through the existing notification bridge. Release Opsfly's additive, legacy-compatible migration and functions first; deploy Orderfly second. This avoids rejecting either the old confirmation payload or the new closed invoice contract during rollout.

Dynamic storefront theming from administration remains out of scope. The Esmeralda storefront currently uses a brand-scoped presentation layer based on the public Esmeralda palette: orange `#f5aa24`, dark brown `#2a1000`, black surfaces, uppercase display headings and compact rounded actions. Other brands are not changed.

## Invoice contract

Payment settlement allocates `INV-YYYY-NNNNNN` from a transactional, brand/year counter. The same transaction stores the full invoice snapshot and creates the confirmation outbox job. Repeated webhooks or receipt polling cannot allocate a second number or resend accounting effects. Already-paid legacy orders retain their original confirmation payload; receipt polling never allocates a retrospective invoice. A newly settled legacy checkout with missing original line prices uses its stored net line amounts and does not invent original prices or apply the item discount twice.

The snapshot contains issue and scheduled supply time, seller legal/trading name, address and CVR, customer identity and delivery address where supplied, fulfillment location, quantity and gross line amounts, item/order discounts, delivery/bag/admin fees, taxable amount, VAT rate and amount, currency, paid total and payment reference. The email renderer escapes every value and includes both HTML and text alternatives.

Brand company name, CVR and legal address are operational prerequisites. This implementation is designed around the Danish VAT invoice fields, but production acceptance still requires the business's accountant or legal adviser to confirm the configured seller data and the correct treatment of its actual supplies, credit notes and retention obligations.

## Tracking contract

Tracking is activated only after statistics consent. The browser emits one standard `purchase` event after a verified paid receipt, with the unique Orderfly order ID as `transaction_id`, DKK value, brand, location and line items. That event is the single GTM integration point for GA4, Google Ads, Meta and an Omnisend web integration. When no GTM container is configured, Orderfly loads the configured GA4/Google tag and Meta Pixel directly; a configured Google Ads ID and purchase label receives a direct conversion event. Meta receives the same order ID as its event ID.

The server stores bounded UTM fields, Google/Meta click IDs, landing path and referrer hostname on the pending order and carries them into the verified payment metric. It never stores the referrer query string. The analytics report uses only verified paid orders for purchase and revenue, supports brand/location/device/source filters, shows daily and location results, and breaks revenue down by source, medium and campaign. Non-monotonic instrumentation is shown as a data-quality warning instead of changing the measured counts.

Omnisend newsletter contact consent and delivery remain server-side through the existing per-brand mapping. A separate consent-gated outbox now sends Omnisend's native server-side `paid for order` v2 event after verified settlement and after the contact has been confirmed subscribed. Financial values come from the immutable invoice. The job contains references rather than contact data, revalidates brand/order/customer scope immediately before sending, and never blindly retries an unknown post-dispatch outcome. This Omnisend subset supplements rather than replaces Orderfly's authoritative paid-order funnel.

## Required configuration

For each brand, set the IDs actually owned by that brand:

- GA4 Measurement ID (`G-...`)
- GTM Container ID (`GTM-...`) when GTM is the tag orchestrator
- Google Ads Conversion ID (`AW-...`) and purchase label when direct Ads conversion is required without GTM
- Meta Pixel ID

Use either the direct configuration or equivalent conversion tags in GTM. Do not configure the same purchase conversion twice. The platform-level server GA4 setting remains the cross-brand operational stream; brand-level browser IDs are for restaurant reporting and campaign optimization.

No browser-only analytics stack can promise literal 100% measurement because consent denial, content blockers and network failure are outside the application. The authoritative sales denominator is therefore the server-verified paid-order count in Orderfly; channel attribution is the consented subset and should be displayed with that coverage distinction.

## Verification

- `tsc --noEmit`
- unit tests for invoice creation, payment idempotency, notification outbox, campaign sanitization, checkout pricing/reliability and feedback mail
- Opsfly notification bridge contract tests and documentation contract
- responsive browser tests at 390 and 1280 widths before release; local execution may be blocked when the Playwright Chromium binary is unavailable

## Deployment sequence

1. Deploy Opsfly migration `20260911123000_orderfly_invoice_confirmation.sql` and the reviewed `orderfly-notification-enqueue`, `notification-admin` `notification-worker` and `production-admin` function tree.
2. Verify that the previous Orderfly confirmation payload still queues and renders without an empty invoice section.
3. Deploy the Orderfly companion release.
4. Complete one controlled paid test order with a synthetic, consented Omnisend contact and verify the stored invoice, receipt, Mailtrap acceptance, rendered HTML/text invoice, server-side paid-order funnel row and Omnisend event share the same order ID, currency and total.
5. Verify that a non-consented paid test order remains in the Orderfly funnel but creates no Omnisend paid-order job or event.

Release corrections: campaign attribution survives untagged navigation in a brand-scoped cookie, and instrumentation origin no longer overwrites campaign source. Zero VAT uses a nullish fallback consistently. Brand tags execute in their own removable document; leaving the brand or withdrawing consent destroys that runtime, including globals and automatic listeners. Only matching brand events enter that document. Direct GA4/Ads and Meta purchases explicitly target the configured destination; GTM receives the ecommerce dataLayer event in that document. GTM containers should consume the supplied commerce events rather than depend on selectors in the storefront document.


The brand tracking document receives only sanitized campaign parameters and allowlisted click IDs; receipt tokens, session IDs and arbitrary URL query values never enter analytics configuration.

## Storefront colour correction (2026-09-11)

The exact `esmeralda` slug uses the measured esmeraldapizza.dk palette: black
`#000000` page/header, white text, `#cccccc` secondary text, gold `#e9aa3f`
actions with `#2a1000` text, and the brown footer. The website's header accent
is `#f5aa24`. Dark elevated panels and visible neutral borders support forms.

The preset is scoped to the public brand root and its body-mounted portals.
Nested commerce roots repeat the tokens so generic yellow/cream defaults and
stored inline brand settings cannot override this fixed preset. Menu, sticky
categories, options, cart, checkout and cookie/delivery dialogs share the palette.
Other brands and Superadmin retain their current appearance. Dynamic admin
presets remain future scope. The 76px header has a matching category offset.

Verify at mobile and desktop widths: readable product prices/descriptions,
gold action text, selected/unselected controls, options and cart portals, focus,
checkout inputs and switching to another brand/Superadmin without theme leakage.
