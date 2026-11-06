# Google feedback import

Implementation stage: manual import and private administration. Not yet deployed or connected to a live Google API project. Public approval and homepage rotation remain a separate next stage; this change does not publish Google content or affect internal feedback statistics.

## Administration

Feedback settings links to `/superadmin/feedback/google`. Each active, authorized brand/location shows connection configuration, last successful import, last outcome and an import button. Configuration presence does not claim working API authorization. Imported rows display original text, author, creation date and an optional Google-hosted avatar; anonymous reviewers remain anonymous. Only brand-wide feedback editors may import. Every server action repeats permission and location-ownership checks. Inactive brands/locations are rejected.

## Server configuration

Provision secrets using the existing secure deployment process, never in the browser or committed config:

- `GOOGLE_FEEDBACK_CLIENT_ID`
- `GOOGLE_FEEDBACK_CLIENT_SECRET`
- `GOOGLE_FEEDBACK_CONNECTIONS`: JSON array of `{brandId, locationId, parent, refreshToken}`. Parent must be the actual API resource `accounts/<numeric-account-id>/locations/<numeric-location-id>`. A Maps CID is not this ID. Duplicate mappings fail closed.

Operator must verify the Google location belongs to the configured Orderfly location. Configuration is server-owned so brand editors cannot select another tenant's Google resource. Tokens require the business.manage OAuth scope and Google's API project approval. Browser login alone is insufficient. No OAuth token collection UI, consent flow or API enablement is included in this commit.

## Import semantics

GET v4 accounts.locations.reviews.list, 50 rows per page, updateTime descending. Fetch all pages, with 100-page bound and repeated-token detection; retain at most 100 unique five-star reviews. Do not partially commit on failures. No review text rewriting. A snapshot above 800 KB fails closed. Tokens, Google response errors and client secrets are never returned to the UI or logged.

`googleFeedbackImports/{locationId}` stores a separate private snapshot, status, actor, timestamp and expiry. A transaction lease prevents overlapping imports for 30 minutes. Success atomically replaces the snapshot, removing reviews no longer in the selected source set. A failed attempt retains the original content expiry. Fresh content expires after 29 days and expired content is never returned to the page. Existing Firestore rules deny direct client access.

Before enabling production import, configure Firestore TTL for `googleFeedbackImports.expiresAt` in data project `orderfly-39325`; verify TTL deletion latency remains within the 30-day limit and exclude this transient collection from durable exports/backups. Review Google's content-use/storage conditions for the intended public display before the homepage stage. Do not treat TTL as a display authorization: read-time expiry is also enforced. No scheduled synchronization is installed in this stage.

## Verification

Run `npm run typecheck`, `node --test tests/unit/feedback-google-client.cjs tests/unit/feedback-google-import.cjs` and existing feedback browser regression suite. New unit coverage executes production modules with synthetic external I/O: authorization, tenant ownership, configuration, expiry preservation, import lease, pagination, five-star filtering, deduplication, source preservation and provider failures. Live import remains blocked pending Google API setup. No production data was written during implementation.

Reference: https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
Storage: https://developers.google.com/my-business/content/policies

## Homepage carousel (follow-up in this PR)

The existing Orderfly website response inserts a scoped section immediately after the recommendation section, after verifying the original payload hash. Original packed assets and page inventory stay unchanged. The client adapter is included in standalone file tracing and served at the exact `/_reviews/rotation.js` route. `/_reviews/customer-reviews.json` returns a public projection of approved five-star Esmeralda/Amager feedback (up to 1,000); imported Google content is additionally opt-in through server environment `GOOGLE_FEEDBACK_PUBLIC_ENABLED=true`. This flag must stay unset until API access, public-display conditions, attribution and retention have been verified. No internal notes, customer contacts or OAuth credentials are exposed. The page hides the section on empty data or an unavailable feed.

Three cards appear on desktop, one on mobile. The supplied screenshot informs the card layout; Esmeralda's black background is retained. An eight-second timer pauses outside the viewport, on hover/focus, in hidden tabs and for reduced-motion preference. Explicit pause and next controls remain available. The client maintains a shuffled queue and seen IDs in sessionStorage, retaining progress across reloads within the same tab. Every available item is drawn once before reshuffling. The final batch may contain fewer than three items. Changed datasets remove missing IDs and incorporate new IDs; round boundaries avoid immediately repeating the last cards when alternatives exist. No fake reviews or verification badges are included.

Validation: `tests/unit/website-review-rotation.cjs` covers 3/3/3/1, fresh cycles, persistence, mobile, changing datasets, small/empty lists and exact insertion against the real homepage. Runtime/browser and live visual verification are still pending; do not claim this section is live.
