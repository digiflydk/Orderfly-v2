# Dine-in feedback from a QR code

The fixed route `/feedback/dine-in/[brandSlug]/[locationSlug]` opens a restaurant questionnaire without a booking, online order, customer account, name or email. For Esmeralda Amager the intended URL is `https://orderfly.dk/feedback/dine-in/esmeralda/amager`. Deployment and live availability must be verified before printing or changing a QR destination.

Feedback settings displays one fixed link for each active location of the selected brand. These are ordinary URLs for the existing QR module, not new QR records. The server resolves the active brand and its location, selects the restaurant question version, and issues a short-lived submission nonce on each uncached page load. Page loads do not create records. The questionnaire uses the existing mobile layout, required-answer validation and retry behavior, with a restaurant title and no contact fields.

Restaurant question sets (`booking`) are reused, independently of the online pickup/delivery questionnaires. A brand-specific restaurant version takes precedence. The server's Esmeralda restaurant defaults are available without a database setup mutation if no scoped version exists. A deliberately deactivated scoped restaurant version is respected. Administrators can edit the restaurant questionnaire through the existing Questions module. An English query (`?lang=en`) uses an available English restaurant version; it does not mislabel Danish questions as English.

Saved entries use `sourceType: dine_in`, `answeredVia: qr`, an anonymous empty customer reference and their authoritative brand/location. The inbox and detail page label these as “Restaurantbesøg (QR)” and “Anonym gæst”. The report has a separate QR source filter and count, so QR answers never inflate online-order counts. Existing moderation remains required for public website publication.

## Optional second step

Only after the server commits valid feedback does the existing external-review receipt enable the second step. The existing brand settings control activation, strict `rating > X`, and Google/Trustpilot links. The rating is computed from star answers, excluding NPS. Only configured providers appear; “Nej tak” remains available. Disabled configuration, missing links, low/equal score, rejected submissions and duplicates do not create a new invitation. No external review is posted automatically and the saved feedback is independent of whether the guest follows a review link.

Releasing this feature does not enable external invitations or fill review links. Those remain the operator's existing configuration. The prior platform-policy caveat on score-selective invitations remains applicable.

## Validation and release

- `node --test tests/unit/feedback-report-public.cjs` covers QR source isolation and anonymous moderation alongside existing access/report regressions.
- `CART_CHROMIUM_PATH=<chromium> node --test tests/unit/feedback-browser.cjs` covers production React components on mobile/desktop: required fields, preserved answers after transport failure, dedicated QR action payload, QR URL, source filtering, report counts and the existing external-review step. Fixture routing is synthetic; it does not create production feedback or send emails.
- The two full QR browser cases call the production context resolver and submit action against synthetic Firestore, then render the real receipt-backed thank-you props and exercise both review links and dismissal. Additional backend token, transaction, duplicate and validation tests remain separate.
- Run typecheck and relevant tests, obtain independent review on the current PR, and follow AGENTS.md gates before coordinator merge/deploy. Confirm the deployed commit and read-only public route/admin UI in production before completion. No production writes or physical QR scan are implied by isolated test success.
