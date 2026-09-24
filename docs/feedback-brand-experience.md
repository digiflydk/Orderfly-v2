# Feedback customer experience

The feedback invitation, form and completion screen reuse Esmeralda's verified Webflow design, replacing the initial invented ivory/serif proposal. The public form and thank-you screen share one layout. Danish forms have Danish placeholders, validation, submission progress and thank-you copy; English versions retain English copy. Booking timestamps explicitly use Europe/Copenhagen rather than server time.

After successful submission or reopening a consumed invitation, the server redirects with the verified brand ID and language. The thank-you URL never contains a customer identifier or invitation bearer token. It reads public brand presentation only and sends Esmeralda guests back to https://www.esmeraldapizza.dk.

The admin inbox and detail show the existing tenant-scoped customer name. `maskCustomerName` controls only the public review projection. This change does not alter consent/moderation defaults or public projection data.

Email styling is implemented separately in esmeralda-restaurant-operations through the managed notification renderer. The renderer retains the published template content and signed link, validates HTML before applying trusted styles, and limits Esmeralda styling to its authenticated organization. Both notification-admin previews and notification-worker sends use that path. Invitation, reminder and thank-you templates are covered; this does not enable reminders or thank-you automation.

## Verification

- `npm run typecheck`: passed.
- Feedback readiness, mail and public report suites: 64 passed.
- Feedback browser suite: 11 passed at 390 and 1280px including successful submission, retained answers on transport failure, branded Danish completion, admin identity and anonymous public review.
- Presentation unit tests: 2 passed, including Copenhagen winter/summer offsets and safe redirect parameters.
- Rendered form and thank-you pages visually inspected at mobile and desktop widths.

The browser fixtures use synthetic data, not production bookings. Chromium was provided through CART_CHROMIUM_PATH; the default browser download was unavailable in this workspace.

## Release

This is an implementation candidate, not evidence of production deployment. Follow AGENTS.md: PR review, PO acceptance, separate merge/deploy and read-only live verification. Deploy the companion notification-admin and notification-worker changes as well before the next controlled booking/email test. No production template, booking, feedback or automation setting was modified for this design change. Existing already-delivered emails retain their old appearance. Styling does not establish or fix inbox placement.

## Webflow source of truth (customer correction, 2026-09-24)

Read the actual Webflow site `6a6c7110638d57d95365ad1c`, its published homepage CSS and booking page, and `rules/universal-layout-and-typography.md` before choosing presentation values. Reuse the original `esmeralda-logo.png` asset, Bourton Base (`bourtonbase.woff2`) for 38px/1.1 H1 headings and CTA typography, and Brandon Text Office Regular at 16px/1.5 for normal body copy. The scope retains the published `.heading-style-h1`, `.text-size-regular`, `.button` and `.es-header-v2__logo` conventions without importing Webflow's unrelated global CSS.

Use the existing black page background, #111111 booking card, white text, #e9aa3f standard button, #2a1000 button text/hover, 10px button radius and 16px booking-card radius. All content is left aligned. The actual header logo is 142px desktop and 104px mobile. No typographic replacement logo or invented serif is used.

Web fonts and logo point to the original published Webflow assets. Visual QA used exact downloaded copies through the optional `FEEDBACK_ASSET_DIR` fixture route because the local test browser could not reach the CDN; this is not evidence of CDN loading in production. QA asserts both font faces loaded and logo naturalWidth > 0, and renders 390/768/1024/1280px widths. The email renderer requests the same fonts; clients without web-font support use the declared safe fallbacks, including Arial for legacy Outlook.

Review correction: Esmeralda palette and typography are tenant-scoped. A second tenant browser flow verifies generic colors and source-derived redirect/website. The browser fixture executes the real thank-you server page against query-derived public brand records. Page-access regression mocks now load the presentation dependency and retain finite-context and mismatch rejection checks.
