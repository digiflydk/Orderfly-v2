# External review invitation settings

Related tasks: #774 (coordinator), #775 (settings).

The existing `feedbackSettings/{brandId}` document stores:

| Field | Default | Validation / meaning |
| --- | --- | --- |
| `externalReviewsEnabled` | `false` | Boolean, independent from mail and public-review publishing settings |
| `externalReviewsMinRating` | `4.7` | Finite number 0–5; invitation requires a strictly greater aggregate star rating |
| `googleReviewUrl` | empty | Optional approved HTTPS Google review/maps URL, max 2048 characters |
| `trustpilotReviewUrl` | empty | Optional approved HTTPS Trustpilot review/evaluate URL, max 2048 characters |

Settings are edited per brand at `/superadmin/feedback/settings`. Existing `feedback:view`, `feedback:edit`, brand ownership and server authorization remain authoritative. The write transaction validates the effective settings and requires at least one valid URL when enabled, including partial updates. `updatedAt` and `updatedBy` retain their existing audit semantics. Disabling preserves the configured links. No migration or production data write is needed; existing brands default to disabled.

`externalReviewSettingsSchema` validates writes. `externalReviewSettings(raw)` returns safe defaults if stored configuration is invalid. `eligibleExternalReviewLinks(raw, rating)` returns the configured provider links only if enabled, at least one link exists, and the finite 0–5 server aggregate star rating is strictly above the configured threshold. NPS is not an input. Missing scores, strings, NaN and out-of-range ratings never qualify. At threshold 4.7, 4.7 does not qualify; 4.71 does. Threshold 5 permits no invitations.

Links accept explicit hosts only. Google: `g.page/r/{id}/review`, `maps.app.goo.gl/{id}`, `goo.gl/maps/{id}`, `search.google.com/local/writereview?placeid=...`, and `/maps` paths on google.com/www.google.com/google.dk/www.google.dk/maps.google.com. Trustpilot: `/review/{business}` or `/evaluate/{business}` on trustpilot.com/www.trustpilot.com/dk.trustpilot.com. Credentials, non-HTTPS schemes, nonstandard ports, fragments, hostname lookalikes and generic Google redirect endpoints are rejected. Shortlink destination ownership cannot be proven from syntax; administrators must use their own business's review link.

The customer flow is handled by #776. The eligibility function is shared by the authoritative submission path and thank-you presentation. It must never trust a query-string rating or client-supplied brand. Feedback persistence and optional review invitation are separate outcomes: review links are only presented after successful feedback storage, with no automatic submission to either provider.

Google and Trustpilot prohibit selectively soliciting reviews based on positive feedback. The PM was informed and explicitly retained score filtering for this implementation. This document is not a statement of platform compliance. No concealment, automatic reviews, incentives or review-content manipulation is implemented.

Validation: `node --test tests/unit/feedback-external-review-settings.cjs` covers defaults, strict threshold, provider URLs, invalid stored data, authenticated brand-scoped persistence and rejected partial updates. `feedback-browser.cjs` provides real Chromium settings-flow regression coverage with synthetic database/auth fixtures. These tests do not verify production login, business link destinations or live customer submissions. Release follows current-head independent review and green CI, serial merge/deploy, actual commit verification and separate live acceptance.
