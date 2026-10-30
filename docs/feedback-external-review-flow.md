# Invitation after feedback submission

Related issues: #774 (coordination), #776 (customer flow).

The existing feedback transaction remains authoritative for source, customer, brand, question version and rating. After a **new** feedback record is committed, an eligible customer can choose Google, Trustpilot or dismiss the invitation. Settings are off by default. Eligibility uses the server-calculated mean of star answers, strictly greater than the configured threshold. NPS and missing star answers do not qualify. Platform policies prohibit selectively soliciting positive reviews; the requested score selection does not remove that restriction.

## Receipt and privacy

No score, receipt or customer identifier is added to the thank-you URL. A fresh random 256-bit token is generated per attempt. Only its SHA-256 hash and numeric 10-minute expiry are written under `feedback/{id}.externalReviewReceipt`, atomically with the new feedback document. The raw token is delivered only after successful commit through `feedback_review_receipt`, an HttpOnly, SameSite=Lax cookie scoped to `/feedback`, Secure in production, with max-age 600 seconds. No additional secret, collection, index or migration is required.

The dynamic thank-you route checks cookie shape, hash, expiry and the saved brand before reading that brand's current settings. It returns only the validated external links to the client. Disabling invitations takes effect on refresh; cookies do not override settings. Links open voluntarily in a new tab with `noopener noreferrer` and no referrer. Plain URL visits or forged query parameters cannot enable the invitation. The public URL's brand controls branding only and must match the receipt record for links.

A previous receipt is cleared at the start of submission, including malformed or rejected submissions. Duplicate submissions do not issue a new receipt. The transaction's final returned outcome, not a mutable flag from an earlier retry, decides whether a cookie is issued. Cookie failures must not report that committed feedback failed; the normal thank-you page remains the fallback. Refresh within the short receipt lifetime may redisplay the invitation; dismissing it affects only the current view. No external review is posted automatically.

## Tests and release

`feedback-external-review-flow.cjs` covers successful saved feedback, hashed receipt, cookie flags, tampering, expiry, malformed receipt, brand isolation, disabling, failed validation/commit, duplicate submissions, booking, missing scores/NPS, threshold boundaries and transaction retry ending in duplicate. `feedback-browser.cjs` exercises actual production components and server actions with synthetic I/O in Chromium, including Danish/English at 390/1280 px, dismissal after save, single-provider visibility, direct-link rejection, and admin settings persistence/viewer protection.

These are isolated integration/browser tests, not production live acceptance. Merge requires current main, completed relevant CI, independent review, typecheck and documentation. The coordinator deploys serially, verifies the actual release and records read-only live QA. No customer feedback, configuration or email is mutated by unattended tests.
