# Feedback customer experience

The feedback invitation, form and completion screen use Esmeralda's charcoal, warm ivory and gold presentation. The public form and thank-you screen share one layout. Danish forms have Danish placeholders, validation, submission progress and thank-you copy; English versions retain English copy. Booking timestamps explicitly use Europe/Copenhagen rather than server time.

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
